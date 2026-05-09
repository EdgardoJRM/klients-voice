import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { CallLogRecord } from "../types/callLog";
import { ddGet, ddPut, ddQueryAll, ddUpdate, getDocClient } from "./dynamodb";

export async function createCallLog(
  input: Omit<CallLogRecord, "call_log_id" | "created_at" | "updated_at">,
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const call_log_id = randomUUID();
  const now = nowIso();
  const item = { ...input, call_log_id, created_at: now, updated_at: now };
  await ddPut({ client, table: env.tableCallLogs, item });
  return item as CallLogRecord;
}

export async function findByConversationId(cid: string): Promise<CallLogRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableCallLogs,
      IndexName: "ConversationIndex",
      KeyConditionExpression: "elevenlabs_conversation_id = :c",
      ExpressionAttributeValues: { ":c": cid },
      Limit: 1,
    },
  });
  return rows[0] as CallLogRecord | undefined;
}

export async function listByParticipant(participantId: string): Promise<CallLogRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableCallLogs,
      IndexName: "ParticipantIndex",
      KeyConditionExpression: "participant_id = :p",
      ExpressionAttributeValues: { ":p": participantId },
    },
  });
  return rows as unknown as CallLogRecord[];
}

export async function patchCallLog(
  callLogId: string,
  patch: Partial<
    Pick<
      CallLogRecord,
      | "elevenlabs_conversation_id"
      | "twilio_call_sid"
      | "status"
      | "outcome"
      | "transcript"
      | "summary"
      | "duration_seconds"
      | "cost_estimate"
      | "recording_url"
      | "metadata"
    >
  >,
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const names: Record<string, string> = { "#u": "updated_at" };
  const values: Record<string, unknown> = { ":u": nowIso() };
  const sets: string[] = ["#u=:u"];
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
    table: env.tableCallLogs,
    key: { call_log_id: callLogId },
    updateExpression: `SET ${sets.join(", ")}`,
    names,
    values,
  });
}

export async function listByTenant(tenantId: string): Promise<CallLogRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableCallLogs,
      IndexName: "TenantCallIndex",
      KeyConditionExpression: "tenant_id = :t",
      ExpressionAttributeValues: { ":t": tenantId },
    },
  });
  return rows as unknown as CallLogRecord[];
}
