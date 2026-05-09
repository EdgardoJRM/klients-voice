import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { Tenant } from "../types/tenant";
import { ddGet, ddPut, ddQueryAll, ddScanPaginated, ddUpdate, getDocClient } from "./dynamodb";

export async function createTenant(input: Omit<Tenant, "tenant_id" | "created_at" | "updated_at">) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const tenant_id = randomUUID();
  const now = nowIso();
  const item = {
    tenant_id,
    ...input,
    created_at: now,
    updated_at: now,
  } satisfies Record<string, unknown>;
  await ddPut({ client, table: env.tableTenants, item });
  return item as unknown as Tenant;
}

export async function getById(tenantId: string): Promise<Tenant | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const item = await ddGet({
    client,
    table: env.tableTenants,
    key: { tenant_id: tenantId },
  });
  return item as Tenant | undefined;
}

export async function getBySlug(slug: string): Promise<Tenant | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const items = await ddQueryAll({
    client,
    input: {
      TableName: env.tableTenants,
      IndexName: "SlugIndex",
      KeyConditionExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "tenant_slug" },
      ExpressionAttributeValues: { ":s": slug },
      Limit: 1,
    },
  });
  return items[0] as Tenant | undefined;
}

export async function listTenants(): Promise<Tenant[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const items = await ddScanPaginated({ client, TableName: env.tableTenants });
  return items as unknown as Tenant[];
}

export async function updateTenantFields(
  tenantId: string,
  patch: Partial<Pick<Tenant, "status" | "plan" | "branding" | "timezone" | "default_language">>,
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const names: Record<string, string> = { "#u": "updated_at" };
  const values: Record<string, unknown> = { ":u": nowIso() };
  const sets: string[] = ["#u = :u"];
  let idx = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#f${idx}`;
    const vk = `:v${idx}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    idx++;
  }
  await ddUpdate({
    client,
    table: env.tableTenants,
    key: { tenant_id: tenantId },
    updateExpression: `SET ${sets.join(", ")}`,
    names,
    values,
  });
}
