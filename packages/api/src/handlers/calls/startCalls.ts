import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { ValidationError } from "../../utils/errors";
import { parseSchema } from "../../utils/validation";
import { startCallsSchema } from "../../schemas/call.schema";
import { parseJsonBody, ok, fail } from "../../utils/response";
import { readEnv } from "../../config/env";
import { withinWindow } from "../../utils/dates";
import { normalizePhoneE164 } from "../../utils/phone";
import type { CallType } from "../../types/callLog";
import type { ParticipantRecord } from "../../types/participant";
import * as tenants from "../../services/tenants";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import * as agents from "../../services/agents";
import * as phones from "../../services/phoneNumbers";
import * as callLogs from "../../services/callLogs";
import { formatDynamicVariables, startOutboundCall } from "../../services/elevenlabs";

type Filter = "all_pending" | "no_answer_only" | "needs_followup_only" | "selected_participants";

export async function handleStartCalls(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const body = parseJsonBody(event);
    const input = parseSchema(startCallsSchema, body);
    middleware.assertTenantAccess(ctx, input.tenant_id);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const summary = await runStartCalls(input);
    return ok(summary);
  } catch (e) {
    return fail(e);
  }
}

export async function runStartCalls(input: {
  tenant_id: string;
  event_id: string;
  call_type: CallType;
  filter?: Filter;
  participant_ids?: string[];
  ignoreWindow?: boolean;
}) {
  const env = readEnv();
  const filter: Filter = input.filter ?? "all_pending";
  const tenant = await tenants.getById(input.tenant_id);
  if (!tenant || tenant.status !== "active") {
    throw new ValidationError("Tenant inactive or missing");
  }
  const evt = await events.getEvent(input.event_id);
  if (!evt || evt.tenant_id !== tenant.tenant_id) {
    throw new ValidationError("Event missing");
  }
  if (input.call_type === "confirmation" && !evt.confirmation_call_enabled) {
    throw new ValidationError("Confirmation calls disabled for this event");
  }
  if (input.call_type === "reminder" && !evt.reminder_call_enabled) {
    throw new ValidationError("Reminder calls disabled for this event");
  }
  if (input.call_type === "followup" && !evt.followup_call_enabled) {
    throw new ValidationError("Follow-up calls disabled for this event");
  }

  const windowOk =
    withinWindow(evt.call_window_start, evt.call_window_end) ||
    !(evt.call_window_start && evt.call_window_end);
  if (!input.ignoreWindow && !windowOk) {
    throw new ValidationError("Outside allowed call window");
  }

  const agent = await agents.pickActiveAgentForTenant(tenant.tenant_id);
  if (!agent) throw new ValidationError("No active agent configured for tenant");

  let phoneRecord = agent.default_phone_number_id
    ? await phones.getPhoneById(agent.default_phone_number_id)
    : undefined;
  if (!phoneRecord || !phoneRecord.elevenlabs_phone_number_id) {
    throw new ValidationError("Phone number not linked with ElevenLabs id");
  }

  const plist = await participants.listByEvent(evt.event_id);
  const filtered = plist.filter((p) => participantMatchesFilter(p, filter, input.participant_ids));

  let attempted = 0;
  let placed = 0;
  const errors: string[] = [];

  for (const p of filtered) {
    if (!p.consent_voice || p.opt_out_voice) continue;
    if (p.retry_count >= evt.max_call_retries) continue;
    const normalized = normalizePhoneE164(p.phone, env.defaultPhoneRegion);
    if (!normalized) {
      errors.push(`missing-phone:${p.participant_id}`);
      continue;
    }
    attempted++;

    const log = await callLogs.createCallLog({
      tenant_id: tenant.tenant_id,
      event_id: evt.event_id,
      participant_id: p.participant_id,
      call_type: input.call_type,
      provider: "elevenlabs",
      from_number: phoneRecord.phone_number,
      to_number: normalized,
      status: "initiating",
      metadata: {},
    });

    await participants.updateParticipantStates(p.participant_id, {
      call_status: "in_progress",
    });

    try {
      const dv = await formatDynamicVariables({
        tenant,
        event: evt,
        participant: p,
        call_type: input.call_type,
      });
      const res = await startOutboundCall({
        agent_id: agent.elevenlabs_agent_id,
        agent_phone_number_id: phoneRecord.elevenlabs_phone_number_id!,
        to_number: normalized,
        dynamic_variables: dv,
      });
      await callLogs.patchCallLog(log.call_log_id, {
        elevenlabs_conversation_id: res.conversation_id,
        twilio_call_sid: res.callSid,
        status: "initiated",
      });
      placed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      await callLogs.patchCallLog(log.call_log_id, {
        status: "failed",
        outcome: "failed",
        summary: msg,
      });
      await participants.updateParticipantStates(p.participant_id, {
        call_status: "failed",
      });
    }
  }

  return { attempted, placed, skipped: filtered.length - attempted, errors };
}

export async function placeOutboundForParticipant(params: {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  call_type: CallType;
}) {
  const tenant = await tenants.getById(params.tenant_id);
  if (!tenant || tenant.status !== "active") return;
  const evt = await events.getEvent(params.event_id);
  const participant = await participants.getParticipant(params.participant_id);
  if (!tenant || !evt || !participant) return;
  await runStartCalls({
    tenant_id: params.tenant_id,
    event_id: params.event_id,
    call_type: params.call_type,
    filter: "selected_participants",
    participant_ids: [params.participant_id],
    ignoreWindow: true,
  });
}

function participantMatchesFilter(
  p: ParticipantRecord,
  filter: Filter,
  ids?: string[],
): boolean {
  if (filter === "selected_participants") {
    return !!ids?.includes(p.participant_id);
  }
  if (filter === "needs_followup_only") return p.attendance_status === "needs_human_followup";
  if (filter === "no_answer_only")
    return p.attendance_status === "no_answer" || p.call_status === "no_answer";
  // all_pending → registered + attendance pending/no_answer voicemail
  if (filter === "all_pending") {
    const pendingAttendance = ["pending", "no_answer", "maybe"].includes(p.attendance_status);
    const pendingCall = ["pending", "failed", "no_answer"].includes(p.call_status);
    return p.registration_status === "registered" && (pendingAttendance || pendingCall);
  }
  return false;
}
