import { randomUUID } from "crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { ParticipantRecord } from "../types/participant";
import { ddGet, ddPut, ddQueryAll, ddUpdate, getDocClient } from "./dynamodb";

function normEmail(email?: string) {
  return email?.trim().toLowerCase();
}

export async function findByEventEmail(
  eventId: string,
  email?: string,
): Promise<ParticipantRecord | undefined> {
  const e = normEmail(email);
  if (!e) return undefined;
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableParticipants,
      IndexName: "EventEmailIndex",
      KeyConditionExpression: "event_id = :e AND email_normalized = :em",
      ExpressionAttributeValues: { ":e": eventId, ":em": e },
      Limit: 1,
    },
  });
  return rows[0] as ParticipantRecord | undefined;
}

export async function findByQrToken(qrToken: string): Promise<ParticipantRecord | undefined> {
  if (!qrToken) return undefined;
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableParticipants,
      IndexName: "QrTokenIndex",
      KeyConditionExpression: "qr_token = :q",
      ExpressionAttributeValues: { ":q": qrToken },
      Limit: 1,
    },
  });
  return rows[0] as ParticipantRecord | undefined;
}

export async function findByEventPhone(
  eventId: string,
  phoneNorm?: string,
): Promise<ParticipantRecord | undefined> {
  if (!phoneNorm) return undefined;
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableParticipants,
      IndexName: "EventPhoneIndex",
      KeyConditionExpression: "event_id = :e AND normalized_phone = :p",
      ExpressionAttributeValues: { ":e": eventId, ":p": phoneNorm },
      Limit: 1,
    },
  });
  return rows[0] as ParticipantRecord | undefined;
}

export async function upsertParticipant(
  input: Omit<
    ParticipantRecord,
    "participant_id" | "created_at" | "updated_at" | "retry_count"
  > &
    Partial<Pick<ParticipantRecord, "participant_id">> & {
      retry_count?: number;
    },
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  const email_normalized = normEmail(input.email);

  let existing: ParticipantRecord | undefined;
  if (email_normalized) {
    existing = await findByEventEmail(input.event_id, input.email);
  }
  if (!existing && input.normalized_phone) {
    existing = await findByEventPhone(input.event_id, input.normalized_phone);
  }

  if (existing) {
    const en = email_normalized ?? normEmail(existing.email);
    const merged: Record<string, unknown> = {
      ...existing,
      first_name: input.first_name ?? existing.first_name,
      last_name: input.last_name ?? existing.last_name,
      full_name: input.full_name ?? existing.full_name,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      normalized_phone: input.normalized_phone ?? existing.normalized_phone,
      company_name: input.company_name ?? existing.company_name,
      consent_voice: input.consent_voice,
      consent_sms: input.consent_sms ?? existing.consent_sms,
      consent_email: input.consent_email ?? existing.consent_email,
      registration_status: input.registration_status,
      attendance_status: input.attendance_status,
      call_status: input.call_status ?? existing.call_status,
      source: input.source ?? existing.source,
      source_funnel: input.source_funnel ?? existing.source_funnel,
      source_page: input.source_page ?? existing.source_page,
      notes: input.notes ?? existing.notes,
      custom_fields: { ...(existing.custom_fields ?? {}), ...(input.custom_fields ?? {}) },
      qr_token: existing.qr_token,
      qr_s3_key: existing.qr_s3_key,
      qr_url: existing.qr_url,
      ticket_pdf_url: existing.ticket_pdf_url,
      checked_in: existing.checked_in ?? false,
      checked_in_at: existing.checked_in_at,
      checked_in_by: existing.checked_in_by,
      access_status: existing.access_status ?? "locked",
      updated_at: now,
    };
    if (en) merged.email_normalized = en;
    else delete merged.email_normalized;
    await ddPut({ client, table: env.tableParticipants, item: merged });
    return merged as unknown as ParticipantRecord;
  }

  const participant_id = randomUUID();
  const item: Record<string, unknown> = {
    participant_id,
    tenant_id: input.tenant_id,
    event_id: input.event_id,
    first_name: input.first_name,
    last_name: input.last_name,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone,
    normalized_phone: input.normalized_phone,
    email_normalized,
    company_name: input.company_name,
    source: input.source,
    source_funnel: input.source_funnel,
    source_page: input.source_page,
    registration_status: input.registration_status,
    attendance_status: input.attendance_status,
    call_status: input.call_status,
    consent_voice: input.consent_voice,
    consent_sms: input.consent_sms,
    consent_email: input.consent_email,
    custom_fields: input.custom_fields ?? {},
    retry_count: input.retry_count ?? 0,
    last_call_at: input.last_call_at,
    next_call_at: input.next_call_at,
    last_call_result: input.last_call_result,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    opt_out_voice: input.opt_out_voice ?? false,
    checked_in: false,
    access_status: "locked",
  };
  await ddPut({ client, table: env.tableParticipants, item });
  return item as unknown as ParticipantRecord;
}

export async function listByEvent(eventId: string): Promise<ParticipantRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableParticipants,
      IndexName: "EventIndex",
      KeyConditionExpression: "event_id = :e",
      ExpressionAttributeValues: { ":e": eventId },
    },
  });
  return rows as unknown as ParticipantRecord[];
}

export async function getParticipant(id: string): Promise<ParticipantRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const row = await ddGet({
    client,
    table: env.tableParticipants,
    key: { participant_id: id },
  });
  return row as ParticipantRecord | undefined;
}

export async function listByTenant(tenantId: string): Promise<ParticipantRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableParticipants,
      IndexName: "TenantParticipantIndex",
      KeyConditionExpression: "tenant_id = :t",
      ExpressionAttributeValues: { ":t": tenantId },
    },
  });
  return rows as unknown as ParticipantRecord[];
}

export async function updateParticipantStates(
  participantId: string,
  patch: Partial<
    Pick<
      ParticipantRecord,
      | "call_status"
      | "attendance_status"
      | "registration_status"
      | "retry_count"
      | "last_call_at"
      | "next_call_at"
      | "last_call_result"
      | "notes"
      | "email_pending"
      | "sms_pending"
      | "opt_out_voice"
      | "qr_token"
      | "qr_s3_key"
      | "qr_url"
      | "ticket_pdf_url"
      | "checked_in"
      | "checked_in_at"
      | "checked_in_by"
      | "access_status"
    >
  >,
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const names: Record<string, string> = { "#u": "updated_at" };
  const values: Record<string, unknown> = { ":u": nowIso() };
  const sets = ["#u=:u"];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#k${i}`;
    const vk = `:v${i}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk}=${vk}`);
    i++;
  }
  await ddUpdate({
    client,
    table: env.tableParticipants,
    key: { participant_id: participantId },
    updateExpression: `SET ${sets.join(", ")}`,
    names,
    values,
  });
}

export async function clearQrFields(participantId: string) {
  const env = readEnv();
  const client = getDocClient(env.region);
  await client.send(
    new UpdateCommand({
      TableName: env.tableParticipants,
      Key: { participant_id: participantId },
      UpdateExpression:
        "REMOVE qr_token, qr_s3_key, qr_url SET #u = :u",
      ExpressionAttributeNames: {
        "#u": "updated_at",
      },
      ExpressionAttributeValues: { ":u": nowIso() },
    }),
  );
}
