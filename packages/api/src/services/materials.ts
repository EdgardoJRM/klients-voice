import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { MaterialRecord } from "../types/material";
import { ddGet, ddPut, ddQueryAll, getDocClient } from "./dynamodb";

function table(): string {
  const t = readEnv().tableMaterials;
  if (!t) throw new Error("TABLE_MATERIALS is not configured");
  return t;
}

export async function createMaterial(input: Omit<MaterialRecord, "material_id" | "created_at" | "updated_at">) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const material_id = randomUUID();
  const now = nowIso();
  const record: MaterialRecord = {
    ...input,
    material_id,
    created_at: now,
    updated_at: now,
  };
  await ddPut({ client, table: table(), item: record as unknown as Record<string, unknown> });
  return record;
}

export async function getMaterial(id: string): Promise<MaterialRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const row = await ddGet({
    client,
    table: table(),
    key: { material_id: id },
  });
  return row as MaterialRecord | undefined;
}

export async function listMaterialsByEvent(eventId: string): Promise<MaterialRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: table(),
      IndexName: "EventMaterialIndex",
      KeyConditionExpression: "event_id = :e",
      ExpressionAttributeValues: { ":e": eventId },
    },
  });
  return rows as unknown as MaterialRecord[];
}

export async function patchMaterial(
  materialId: string,
  patch: Partial<
    Pick<MaterialRecord, "title" | "description" | "s3_key" | "external_url" | "status" | "access_rule">
  >,
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const existing = await getMaterial(materialId);
  if (!existing) return undefined;
  const updated: MaterialRecord = {
    ...existing,
    ...patch,
    updated_at: nowIso(),
  };
  await ddPut({ client, table: table(), item: updated as unknown as Record<string, unknown> });
  return updated;
}

export function materialsKey(tenantId: string, eventId: string, materialId: string, filename: string) {
  return `materials/${tenantId}/${eventId}/${materialId}/${filename}`;
}
