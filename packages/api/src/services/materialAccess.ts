import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { MaterialAccessRecord, MaterialAccessStatus } from "../types/material";
import { ddGet, ddPut, ddQueryAll, getDocClient } from "./dynamodb";

function table(): string {
  const t = readEnv().tableMaterialAccess;
  if (!t) throw new Error("TABLE_MATERIAL_ACCESS is not configured");
  return t;
}

export async function findAccess(
  participantId: string,
  materialId: string,
): Promise<MaterialAccessRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: table(),
      IndexName: "ParticipantMaterialIndex",
      KeyConditionExpression: "participant_id = :p AND material_id = :m",
      ExpressionAttributeValues: { ":p": participantId, ":m": materialId },
      Limit: 1,
    },
  });
  return rows[0] as MaterialAccessRecord | undefined;
}

export async function setParticipantMaterialAccess(args: {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  material_id: string;
  access_status: MaterialAccessStatus;
}): Promise<MaterialAccessRecord> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  const existing = await findAccess(args.participant_id, args.material_id);
  const access_id = existing?.access_id ?? randomUUID();
  const rec: MaterialAccessRecord = {
    access_id,
    tenant_id: args.tenant_id,
    event_id: args.event_id,
    participant_id: args.participant_id,
    material_id: args.material_id,
    access_status: args.access_status,
    unlocked_at: args.access_status === "unlocked" ? now : existing?.unlocked_at,
    expires_at: existing?.expires_at,
    last_accessed_at: existing?.last_accessed_at,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  await ddPut({ client, table: table(), item: rec as unknown as Record<string, unknown> });
  return rec;
}

export async function touchLastAccess(accessId: string) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const row = await ddGet({
    client,
    table: table(),
    key: { access_id: accessId },
  });
  const existing = row as MaterialAccessRecord | undefined;
  if (!existing) return;
  existing.last_accessed_at = nowIso();
  existing.updated_at = existing.last_accessed_at;
  await ddPut({
    client,
    table: table(),
    item: existing as unknown as Record<string, unknown>,
  });
}

export async function listAccessForParticipant(participantId: string): Promise<MaterialAccessRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: table(),
      IndexName: "ParticipantMaterialIndex",
      KeyConditionExpression: "participant_id = :p",
      ExpressionAttributeValues: { ":p": participantId },
    },
  });
  return rows as unknown as MaterialAccessRecord[];
}
