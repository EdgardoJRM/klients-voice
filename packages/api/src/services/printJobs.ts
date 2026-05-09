import { randomUUID } from "crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { readEnv } from "../config/env";
import { nowIso } from "../utils/dates";
import type { PrintJobRecord, PrintJobStatus } from "../types/print";
import * as participants from "./participants";
import * as events from "./events";
import * as tenants from "./tenants";
import { generateEventLabelPdf } from "./labelGenerator";
import { putObjectBuffer, presignGetObject } from "./s3Qr";
import { ddGet, ddPut, ddQueryAll, getDocClient } from "./dynamodb";

function table(): string {
  const t = readEnv().tablePrintJobs;
  if (!t) throw new Error("TABLE_PRINT_JOBS is not configured");
  return t;
}

function queueSk(status: PrintJobStatus, iso: string, jobId: string) {
  return `${status.toUpperCase()}#${iso}#${jobId}`;
}

export async function createPrintJob(
  payload: Omit<PrintJobRecord, "print_job_id" | "created_at" | "updated_at" | "attempts"> & {
    print_job_id?: string;
    created_at?: string;
    attempts?: number;
  },
): Promise<PrintJobRecord> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const ts = payload.created_at ?? nowIso();
  const print_job_id = payload.print_job_id ?? randomUUID();
  const row: PrintJobRecord = {
    ...payload,
    print_job_id,
    attempts: payload.attempts ?? 0,
    created_at: ts,
    updated_at: ts,
    evt_queue_sk: queueSk(payload.status, ts, print_job_id),
  };
  await ddPut({
    client,
    table: table(),
    item: row as unknown as Record<string, unknown>,
  });
  return row;
}

export async function getPrintJob(id: string): Promise<PrintJobRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const row = await ddGet({
    client,
    table: table(),
    key: { print_job_id: id },
  });
  return row as PrintJobRecord | undefined;
}

export async function listQueuedJobsForEvent(
  eventId: string,
  stationFilter?: string,
): Promise<PrintJobRecord[]> {
  const env = readEnv();
  if (!env.tablePrintJobs) return [];
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tablePrintJobs!,
    },
  });
  const jobs = (rows as unknown as PrintJobRecord[]).filter(
    (j) => j.event_id === eventId && j.status === "queued",
  );
  if (!stationFilter) return jobs;
  return jobs.filter((j) => !j.station_id || j.station_id === stationFilter);
}

/** Jobs whose evt_queue_sk begins with e.g. `PRINTED#` or `FAILED#` */
export async function listJobsByEvtQueuePrefix(eventId: string, skPrefix: string): Promise<PrintJobRecord[]> {
  const env = readEnv();
  if (!env.tablePrintJobs) return [];
  try {
    const client = getDocClient(env.region);
    const rows = await ddQueryAll({
      client,
      input: {
        TableName: env.tablePrintJobs!,
      },
    });
    return (rows as unknown as PrintJobRecord[]).filter(
      (r) => r.event_id === eventId && (r.evt_queue_sk?.startsWith(skPrefix) ?? false),
    );
  } catch (e) {
    console.warn(
      JSON.stringify({
        msg: "listJobsByEvtQueuePrefix_failed",
        event_id: eventId,
        err: e instanceof Error ? e.message : String(e),
      }),
    );
    return [];
  }
}

export async function getRecentPrintJobsForEvent(eventId: string, limit: number): Promise<PrintJobRecord[]> {
  const prefixes = ["PRINTED#", "FAILED#", "QUEUED#", "CLAIMED#", "PRINTING#"];
  const merged: PrintJobRecord[] = [];
  for (const p of prefixes) {
    merged.push(...(await listJobsByEvtQueuePrefix(eventId, p)));
  }
  merged.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return merged.slice(0, limit);
}

export async function claimPrintJob(
  jobId: string,
  stationId?: string,
): Promise<PrintJobRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  const newSk = queueSk("claimed", now, jobId);
  try {
    await client.send(
      new UpdateCommand({
        TableName: table(),
        Key: { print_job_id: jobId },
        ConditionExpression: "#st = :q",
        UpdateExpression:
          "SET #st = :c, evt_queue_sk = :sk, claimed_at = :ca, updated_at = :u, station_id = :sid",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":q": "queued",
          ":c": "claimed",
          ":sk": newSk,
          ":ca": now,
          ":u": now,
          ":sid": stationId ?? "_",
        },
      }),
    );
  } catch {
    return undefined;
  }
  return getPrintJob(jobId);
}

export async function markPrinting(jobId: string): Promise<boolean> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  try {
    await client.send(
      new UpdateCommand({
        TableName: table(),
        Key: { print_job_id: jobId },
        ConditionExpression: "#st = :c",
        UpdateExpression: "SET #st = :p, evt_queue_sk = :sk, updated_at = :u",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":c": "claimed",
          ":p": "printing",
          ":sk": queueSk("printing", now, jobId),
          ":u": now,
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function markPrintComplete(jobId: string): Promise<boolean> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  try {
    await client.send(
      new UpdateCommand({
        TableName: table(),
        Key: { print_job_id: jobId },
        ConditionExpression: "#st IN (:c,:p)",
        UpdateExpression: "SET #st = :done, evt_queue_sk = :sk, printed_at = :pa, updated_at = :u",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":c": "claimed",
          ":p": "printing",
          ":done": "printed",
          ":sk": queueSk("printed", now, jobId),
          ":pa": now,
          ":u": now,
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function markPrintFailed(jobId: string, errorMessage: string): Promise<boolean> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  try {
    await client.send(
      new UpdateCommand({
        TableName: table(),
        Key: { print_job_id: jobId },
        UpdateExpression:
          "SET #st = :f, evt_queue_sk = :sk, error_message = :em, updated_at = :u, attempts = attempts + :one",
        ExpressionAttributeNames: { "#st": "status" },
        ExpressionAttributeValues: {
          ":f": "failed",
          ":sk": queueSk("failed", now, jobId),
          ":em": errorMessage.slice(0, 2000),
          ":u": now,
          ":one": 1,
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Thermal label PDF in S3 + PrintJob queued (runs after attendee check-in when enabled).
 */
export async function enqueueLabelPrintJobAfterCheckIn(args: {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  station_id?: string;
  created_by?: string;
}): Promise<PrintJobRecord | undefined> {
  const env = readEnv();
  if (!env.tablePrintJobs || !env.s3BucketAssets) return undefined;

  try {
    const participant = await participants.getParticipant(args.participant_id);
    const event = await events.getEvent(args.event_id);
    if (!participant || !event) return undefined;

    let tenantName: string | undefined;
    try {
      const t = await tenants.getById(args.tenant_id);
      tenantName = t?.business_name ?? t?.tenant_name;
    } catch {
      /* optional */
    }

    const pdfBuffer = await generateEventLabelPdf({ participant, event, tenantName });
    const jobId = randomUUID();
    const key = `labels/${args.tenant_id}/${args.event_id}/${args.participant_id}/${jobId}.pdf`;
    await putObjectBuffer({
      key,
      body: pdfBuffer,
      contentType: "application/pdf",
    });
    let label_url: string | undefined;
    try {
      label_url = await presignGetObject({
        key,
        ttlSeconds: 900,
        responseContentType: "application/pdf",
      });
    } catch {
      /* optional */
    }

    console.log(
      JSON.stringify({
        msg: "print_job_enqueued",
        print_job_id: jobId,
        event_id: args.event_id,
        participant_id: args.participant_id,
      }),
    );

    return createPrintJob({
      tenant_id: args.tenant_id,
      event_id: args.event_id,
      participant_id: args.participant_id,
      station_id: args.station_id,
      label_s3_key: key,
      label_url,
      status: "queued",
      created_by: args.created_by,
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        msg: "print_job_enqueue_error",
        event_id: args.event_id,
        participant_id: args.participant_id,
        err: e instanceof Error ? e.message : String(e),
      }),
    );
    return undefined;
  }
}
