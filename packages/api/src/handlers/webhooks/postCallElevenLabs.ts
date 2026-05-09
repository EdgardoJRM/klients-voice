import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ParticipantRecord } from "../../types/participant";
import { readEnv } from "../../config/env";
import {
  classifyCallOutcome,
  parsePostCallWebhook,
  verifyElevenLabsWebhookSignature,
} from "../../services/elevenlabs";
import * as tenants from "../../services/tenants";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import * as callLogs from "../../services/callLogs";
import * as ses from "../../services/ses";
import { enqueueCallRetry } from "../../services/retryQueue";

function dyn(vars: Record<string, unknown> | undefined, key: string) {
  const v = vars?.[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function attendanceFromOutcome(o: ReturnType<typeof classifyCallOutcome>): ParticipantRecord["attendance_status"] {
  if (o === "confirmed") return "confirmed";
  if (o === "cancelled") return "cancelled";
  if (o === "maybe") return "maybe";
  if (o === "no_answer" || o === "voicemail") return "no_answer";
  if (o === "needs_human_followup") return "needs_human_followup";
  return "pending";
}

export async function handleElevenLabsPostCall(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const env = readEnv();
  const raw =
    event.isBase64Encoded && event.body ? Buffer.from(event.body, "base64").toString("utf8") : event.body ?? "{}";

  try {
    const sigHeader =
      event.headers["elevenlabs-signature"] ?? event.headers["ElevenLabs-Signature"] ?? null;
    if (
      env.elevenlabsWebhookSecret &&
      !verifyElevenLabsWebhookSignature({
        rawBody: raw,
        signatureHeader: sigHeader,
        secret: env.elevenlabsWebhookSecret,
      })
    ) {
      return { statusCode: 401, body: JSON.stringify({ ok: false }) };
    }

    const json = JSON.parse(raw) as unknown;
    const parsed = parsePostCallWebhook(json);
    if (!parsed.ok) return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    if (parsed.kind === "audio") return { statusCode: 200, body: JSON.stringify({ ok: true }) };

    if (parsed.kind === "failure") {
      const d = (parsed.data ?? {}) as { conversation_id?: string; failure_reason?: string };
      if (d.conversation_id) {
        const existing = await callLogs.findByConversationId(d.conversation_id);
        if (existing) {
          await callLogs.patchCallLog(existing.call_log_id, {
            status: "failure:" + (d.failure_reason ?? "unknown"),
            outcome: d.failure_reason === "busy" ? "no_answer" : "failed",
          });
        }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const data = parsed.data as Record<string, unknown>;
    const convId = data.conversation_id as string | undefined;
    const transcript = data.transcript as unknown;
    const analysis = data.analysis as { call_successful?: unknown; transcript_summary?: string } | undefined;
    const md = data.metadata as { call_duration_secs?: number; termination_reason?: string } | undefined;
    const dynVars = (
      (data.conversation_initiation_client_data as { dynamic_variables?: Record<string, unknown> } | undefined)
        ?.dynamic_variables ?? {}
    ) as Record<string, unknown>;

    const tenantId = dyn(dynVars, "tenant_id");
    const eventId = dyn(dynVars, "event_id");
    const participantId = dyn(dynVars, "participant_id");

    const outcome = classifyCallOutcome({
      transcriptSummary: analysis?.transcript_summary,
      analysis: { call_successful: analysis?.call_successful as boolean | string | undefined },
      terminationReason: md?.termination_reason,
    });

    let target = convId ? await callLogs.findByConversationId(convId) : undefined;
    if (!target && tenantId && eventId && participantId && convId) {
      await callLogs.createCallLog({
        tenant_id: tenantId,
        event_id: eventId,
        participant_id: participantId,
        call_type: "custom",
        provider: "elevenlabs",
        status: "completed",
        outcome,
        transcript,
        summary: analysis?.transcript_summary,
        duration_seconds: md?.call_duration_secs,
        elevenlabs_conversation_id: convId,
        metadata: { source: "post_call_webhook" },
      });
      target = await callLogs.findByConversationId(convId);
    }

    if (target) {
      await callLogs.patchCallLog(target.call_log_id, {
        status: "completed",
        outcome,
        transcript,
        summary: analysis?.transcript_summary,
        duration_seconds: md?.call_duration_secs,
        elevenlabs_conversation_id: convId,
      });
    }

    if (!tenantId || !eventId || !participantId) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const tenant = await tenants.getById(tenantId);
    const evt = await events.getEvent(eventId);
    const participant = await participants.getParticipant(participantId);
    if (!tenant || !evt || !participant) return { statusCode: 200, body: JSON.stringify({ ok: true }) };

    const attendance = attendanceFromOutcome(outcome);
    const nextRetries =
      participant.retry_count + (outcome === "no_answer" || outcome === "voicemail" ? 1 : 0);

    const patchStates: Partial<
      Pick<
        ParticipantRecord,
        | "attendance_status"
        | "last_call_result"
        | "call_status"
        | "last_call_at"
        | "retry_count"
        | "email_pending"
        | "sms_pending"
      >
    > = {
      attendance_status: attendance,
      last_call_result: outcome,
      call_status:
        outcome === "no_answer" ? "no_answer" : outcome === "voicemail" ? "voicemail" : "completed",
      last_call_at: new Date().toISOString(),
      retry_count: nextRetries,
    };

    if (outcome === "confirmed" && evt.event_type === "webinar") {
      patchStates.email_pending = true;
    }
    if (outcome === "confirmed" && evt.event_type === "in_person") {
      patchStates.sms_pending = true;
    }

    await participants.updateParticipantStates(participant.participant_id, patchStates);

    if (
      attendance === "confirmed" &&
      participant.consent_email === true &&
      participant.email &&
      env.sesFromEmail
    ) {
      await ses.sendConfirmedAfterCallEmail({
        tenant_id: tenant.tenant_id,
        participant: { ...participant, ...patchStates },
        event: evt,
        summary: typeof analysis?.transcript_summary === "string" ? analysis.transcript_summary : undefined,
        outcomeLabel: outcome,
      });
    }

    const maxRetries = evt.max_call_retries ?? 0;
    const shouldRetry =
      (outcome === "no_answer" || outcome === "voicemail") &&
      nextRetries < maxRetries &&
      !!env.retryQueueUrl;

    if (shouldRetry) {
      await enqueueCallRetry({
        tenant_id: tenant.tenant_id,
        event_id: evt.event_id,
        participant_id: participant.participant_id,
        call_type: "confirmation",
        delaySeconds: 120,
      });
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("elevenlabs webhook", e);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
}
