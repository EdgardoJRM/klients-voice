import crypto from "node:crypto";
import type { Tenant } from "../types/tenant";
import type { EventRecord } from "../types/event";
import type { ParticipantRecord } from "../types/participant";
import type { CallType } from "../types/callLog";
import { classifyCallOutcome } from "../utils/outcomeClassifier";
import { getElevenLabsApiKey } from "./secrets";

export type OutboundDynamicVariables = Record<string, string | number | boolean>;

export { classifyCallOutcome };

export async function formatDynamicVariables(input: {
  tenant: Tenant;
  event: EventRecord;
  participant: ParticipantRecord;
  call_type: CallType;
}): Promise<OutboundDynamicVariables> {
  const { tenant, event, participant, call_type } = input;
  const first =
    participant.first_name ??
    (participant.full_name ? participant.full_name.split(" ")[0] : "allí");

  return {
    agent_name: tenant.tenant_name.slice(0, 80),
    business_name: tenant.business_name,
    participant_name:
      participant.full_name ??
      [participant.first_name, participant.last_name].filter(Boolean).join(" "),
    first_name: first,
    event_title: event.title,
    event_type: event.event_type,
    event_date: event.date,
    event_time: event.start_time ?? "",
    location_name: event.location_name ?? "",
    location_address: event.location_address ?? "",
    webinar_url: event.webinar_url ?? "",
    webinar_platform: event.webinar_platform,
    host_name: event.host_name ?? "",
    tenant_name: tenant.tenant_name,
    participant_id: participant.participant_id,
    tenant_id: tenant.tenant_id,
    event_id: event.event_id,
    call_type,
  };
}

export type StartOutboundPayload = {
  agent_id: string;
  agent_phone_number_id: string;
  to_number: string;
  dynamic_variables?: OutboundDynamicVariables;
};

export type StartOutboundResult = {
  conversation_id?: string;
  callSid?: string;
  raw: unknown;
};

export async function startOutboundCall(payload: StartOutboundPayload): Promise<StartOutboundResult> {
  const key = await getElevenLabsApiKey();
  const body: Record<string, unknown> = {
    agent_id: payload.agent_id,
    agent_phone_number_id: payload.agent_phone_number_id,
    to_number: payload.to_number,
  };
  if (payload.dynamic_variables && Object.keys(payload.dynamic_variables).length) {
    body.conversation_initiation_client_data = {
      dynamic_variables: payload.dynamic_variables,
    };
  }

  const res = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": key,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof json === "object" && json && "detail" in json
        ? String((json as { detail?: unknown }).detail)
        : typeof json === "object" && json && "message" in json
          ? String((json as { message?: unknown }).message)
          : `ElevenLabs HTTP ${res.status}`;
    throw new Error(msg);
  }
  const obj = json as { conversation_id?: string; callSid?: string };
  return { conversation_id: obj.conversation_id, callSid: obj.callSid, raw: json };
}

export function parsePostCallWebhook(json: unknown) {
  if (!json || typeof json !== "object") return { ok: false as const, reason: "empty" };
  const o = json as { type?: string; data?: Record<string, unknown> };
  if (o.type === "post_call_transcription")
    return { ok: true as const, kind: "transcription" as const, data: o.data };
  if (o.type === "call_initiation_failure")
    return { ok: true as const, kind: "failure" as const, data: o.data };
  if (o.type === "post_call_audio") return { ok: true as const, kind: "audio" as const, data: o.data };
  return { ok: false as const, reason: `unknown:${String(o.type)}` };
}

export function verifyElevenLabsWebhookSignature(args: {
  rawBody: string;
  signatureHeader?: string | null;
  secret: string;
}): boolean {
  if (!args.secret) return true;
  if (!args.signatureHeader) return false;
  const expected = crypto.createHmac("sha256", args.secret).update(args.rawBody, "utf8").digest("hex");
  const sig = args.signatureHeader.trim();
  try {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return false;
  }
}
