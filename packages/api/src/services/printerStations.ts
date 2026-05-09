import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readEnv } from "../config/env";
import { AuthError } from "../utils/errors";
import { nowIso } from "../utils/dates";
import type { PrinterStationRecord } from "../types/print";
import { ddGet, ddPut, ddQueryAll, getDocClient } from "./dynamodb";

const PAIRING_TTL_MS = 10 * 60 * 1000;

function table(): string {
  const t = readEnv().tablePrinterStations;
  if (!t) throw new Error("TABLE_PRINTER_STATIONS is not configured");
  return t;
}

export function hashPairingInput(code: string): string {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

export function hashApiSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function createStationWithPairingCode(args: {
  tenant_id: string;
  event_id: string;
  station_name?: string;
}): Promise<{ station: PrinterStationRecord; pairing_code: string }> {
  const pairing_code = String(randomInt(100_000, 1_000_000));
  const pairing_code_hash = hashPairingInput(pairing_code);
  const station_id = randomUUID();
  const now = nowIso();
  const pairing_expires_at = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const tenant_event_sk = `${args.tenant_id}#${args.event_id}`;
  const station: PrinterStationRecord = {
    station_id,
    tenant_id: args.tenant_id,
    event_id: args.event_id,
    tenant_event_sk,
    station_name: args.station_name,
    status: "pending_pairing",
    print_mode: "auto",
    pairing_code_hash,
    pairing_expires_at,
    created_at: now,
    updated_at: now,
  };
  await ddPut({
    client: getDocClient(readEnv().region),
    table: table(),
    item: station as unknown as Record<string, unknown>,
  });
  return { station, pairing_code };
}

export async function getStation(stationId: string): Promise<PrinterStationRecord | undefined> {
  const env = readEnv();
  const row = await ddGet({
    client: getDocClient(env.region),
    table: table(),
    key: { station_id: stationId },
  });
  return row as PrinterStationRecord | undefined;
}

export async function findStationsByPairingHash(pairingHash: string): Promise<PrinterStationRecord[]> {
  const env = readEnv();
  const rows = await ddQueryAll({
    client: getDocClient(env.region),
    input: {
      TableName: table(),
      IndexName: "PairingCodeHashIndex",
      KeyConditionExpression: "pairing_code_hash = :h",
      ExpressionAttributeValues: { ":h": pairingHash },
    },
  });
  return rows as unknown as PrinterStationRecord[];
}

export async function activatePairing(args: {
  pairing_code: string;
  device_name?: string;
  local_app_version?: string;
}): Promise<{ station: PrinterStationRecord; station_token: string }> {
  const hash = hashPairingInput(args.pairing_code);
  const candidates = await findStationsByPairingHash(hash);
  const nowMs = Date.now();
  const pending = candidates.filter(
    (s) =>
      s.status === "pending_pairing" &&
      s.pairing_expires_at &&
      new Date(s.pairing_expires_at).getTime() > nowMs,
  );
  const station = pending[0];
  if (!station) {
    throw new AuthError("Invalid or expired pairing code");
  }

  const secretPlain = randomBytes(24).toString("hex");
  const station_token = `${station.station_id}:${secretPlain}`;
  const api_key_hash = hashApiSecret(secretPlain);
  const env = readEnv();
  const client = getDocClient(env.region);
  const ts = nowIso();

  await client.send(
    new UpdateCommand({
      TableName: table(),
      Key: { station_id: station.station_id },
      UpdateExpression:
        "SET #st = :on, api_key_hash = :tk, device_name = :dn, local_app_version = :lv, updated_at = :u, last_seen_at = :ls REMOVE pairing_code_hash, pairing_expires_at",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":on": "online",
        ":tk": api_key_hash,
        ":dn": args.device_name ?? "_",
        ":lv": args.local_app_version ?? "_",
        ":u": ts,
        ":ls": ts,
      },
    }),
  );

  const refreshed = await getStation(station.station_id);
  if (!refreshed) throw new Error("station missing after activate");
  return { station: refreshed, station_token };
}

export async function heartbeatStationRecord(
  stationId: string,
  patch: { assigned_printer_name?: string; local_app_version?: string },
) {
  const env = readEnv();
  const client = getDocClient(env.region);
  const ts = nowIso();
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  let i = 0;
  const setOne = (field: string, value: unknown) => {
    const nk = `#f${i}`;
    const vk = `:f${i}`;
    names[nk] = field;
    vals[vk] = value;
    i++;
    return `${nk} = ${vk}`;
  };
  const parts = [setOne("status", "online"), setOne("updated_at", ts), setOne("last_seen_at", ts)];
  if (patch.assigned_printer_name !== undefined) parts.push(setOne("assigned_printer_name", patch.assigned_printer_name));
  if (patch.local_app_version !== undefined) parts.push(setOne("local_app_version", patch.local_app_version));

  await client.send(
    new UpdateCommand({
      TableName: table(),
      Key: { station_id: stationId },
      UpdateExpression: `SET ${parts.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals as never,
    }),
  );
}

export function parseStationToken(headerValue: string | undefined): { stationId: string; secret: string } {
  if (!headerValue?.trim()) throw new AuthError("Missing station token");
  const raw = headerValue.trim();
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx === raw.length - 1) throw new AuthError("Invalid station token format");
  return { stationId: raw.slice(0, idx), secret: raw.slice(idx + 1) };
}

export async function validateStationAuth(headerValue: string | undefined): Promise<PrinterStationRecord> {
  const { stationId, secret } = parseStationToken(headerValue);
  const station = await getStation(stationId);
  if (!station?.api_key_hash) throw new AuthError("Unknown station");
  const h = hashApiSecret(secret);
  if (h !== station.api_key_hash) throw new AuthError("Invalid station token");
  if (station.status === "pending_pairing") throw new AuthError("Station not paired");
  return station;
}

export async function listStationsForEvent(tenantId: string, eventId: string): Promise<PrinterStationRecord[]> {
  const env = readEnv();
  if (!env.tablePrinterStations) return [];
  const sk = `${tenantId}#${eventId}`;
  const rows = await ddQueryAll({
    client: getDocClient(env.region),
    input: {
      TableName: table(),
      IndexName: "TenantEventStationIndex",
      KeyConditionExpression: "tenant_event_sk = :te",
      ExpressionAttributeValues: { ":te": sk },
    },
  });
  return rows as unknown as PrinterStationRecord[];
}
