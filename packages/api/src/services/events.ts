import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { EventRecord } from "../types/event";
import {
  ddGet,
  ddPut,
  ddQueryAll,
  ddScanPaginated,
  ddUpdate,
  getDocClient,
} from "./dynamodb";

export async function createEvent(
  input: Omit<EventRecord, "event_id" | "created_at" | "updated_at" | "call_campaign_status"> & {
    call_campaign_status?: EventRecord["call_campaign_status"];
  },
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const event_id = randomUUID();
  const now = nowIso();
  const item = {
    ...input,
    event_id,
    tenant_date_sk: `${input.date}#${event_id}`,
    call_campaign_status: input.call_campaign_status ?? "not_started",
    created_at: now,
    updated_at: now,
  } as unknown as Record<string, unknown>;
  await ddPut({ client, table: env.tableEvents, item });
  return item as unknown as EventRecord;
}

export async function getEvent(eventId: string): Promise<EventRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const item = await ddGet({
    client,
    table: env.tableEvents,
    key: { event_id: eventId },
  });
  return item as EventRecord | undefined;
}

export async function listEventsByTenant(tenantId: string): Promise<EventRecord[]> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const items = await ddQueryAll({
    client,
    input: {
      TableName: env.tableEvents,
      IndexName: "TenantDateIndex",
      KeyConditionExpression: "tenant_id = :t",
      ExpressionAttributeValues: { ":t": tenantId },
    },
  });
  return items as unknown as EventRecord[];
}

export async function findEventByTenantTitleDate(
  tenantId: string,
  title: string,
  date: string,
): Promise<EventRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const items = await ddScanPaginated({
    client,
    TableName: env.tableEvents,
    FilterExpression: "tenant_id = :t AND #d = :d AND #ti = :title",
    ExpressionAttributeNames: { "#d": "date", "#ti": "title" },
    ExpressionAttributeValues: { ":t": tenantId, ":d": date, ":title": title },
    Limit: 50,
  });
  return items[0] as EventRecord | undefined;
}

export type EventMutableFields = Partial<
  Pick<
    EventRecord,
    | "title"
    | "description"
    | "date"
    | "start_time"
    | "end_time"
    | "timezone"
    | "location_name"
    | "location_address"
    | "webinar_platform"
    | "webinar_url"
    | "status"
    | "call_campaign_status"
    | "confirmation_call_enabled"
    | "reminder_call_enabled"
    | "followup_call_enabled"
    | "qr_enabled"
    | "print_labels_enabled"
    | "scanner_enabled"
    | "materials_enabled"
    | "protected_access_rule"
    | "selected_label_template_id"
    | "max_call_retries"
    | "call_window_start"
    | "call_window_end"
    | "replay_url"
    | "host_name"
  >
>;

export async function updateEventFields(eventId: string, patch: EventMutableFields) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const names: Record<string, string> = { "#u": "updated_at" };
  const values: Record<string, unknown> = { ":u": nowIso() };
  const sets: string[] = ["#u = :u"];
  let idx = 0;

  const toApply = { ...patch } as Record<string, unknown>;
  if (patch.date !== undefined && typeof patch.date === "string") {
    toApply.tenant_date_sk = `${patch.date}#${eventId}`;
  }

  for (const [k, v] of Object.entries(toApply)) {
    if (v === undefined) continue;
    const nk = `#k${idx}`;
    const vk = `:v${idx}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    idx++;
  }
  await ddUpdate({
    client,
    table: env.tableEvents,
    key: { event_id: eventId },
    updateExpression: `SET ${sets.join(", ")}`,
    names,
    values,
  });
}
