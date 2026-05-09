import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { printJobClaimSchema, printJobFailSchema } from "../../schemas/materials.schema";
import { stationTestPrintSchema } from "../../schemas/printerStation.schema";
import type { PrintJobRecord } from "../../types/print";
import * as participants from "../../services/participants";
import * as printJobs from "../../services/printJobs";
import * as stations from "../../services/printerStations";
import { presignGetObject } from "../../services/s3Qr";
import { AppError, NotFoundError } from "../../utils/errors";
import { created, ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

function stationTokenHeader(event: APIGatewayProxyEventV2): string | undefined {
  return (
    event.headers["x-station-token"] ??
    event.headers["X-Station-Token"] ??
    event.headers["x-station-authorization"]
  );
}

function assertJobScoped(job: PrintJobRecord, tenantId: string, eventId: string) {
  if (job.tenant_id !== tenantId || job.event_id !== eventId) {
    throw new NotFoundError("print_job");
  }
}

export async function handleStationListJobs(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const station = await stations.validateStationAuth(stationTokenHeader(event));
    const jobs = await printJobs.listQueuedJobsForEvent(station.event_id, station.station_id);
    return ok(jobs);
  } catch (e) {
    return fail(e);
  }
}

export async function handleStationClaimJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const station = await stations.validateStationAuth(stationTokenHeader(event));
    const raw = (() => {
      try {
        return event.body ? (parseJsonBody(event) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();
    const body = parseSchema(printJobClaimSchema, raw);
    const existing = await printJobs.getPrintJob(jobId);
    if (!existing) throw new NotFoundError("print_job");
    assertJobScoped(existing, station.tenant_id, station.event_id);

    const claimed = await printJobs.claimPrintJob(jobId, body.station_id ?? station.station_id);
    if (!claimed) {
      throw new AppError("Job not available to claim", { statusCode: 409, code: "CLAIM_CONFLICT" });
    }
    let payload = claimed;
    if (claimed.label_s3_key) {
      try {
        const label_url = await presignGetObject({
          key: claimed.label_s3_key,
          ttlSeconds: 900,
          responseContentType: "application/pdf",
        });
        payload = { ...claimed, label_url };
      } catch (e) {
        console.warn(
          JSON.stringify({
            msg: "station_claim_presign_failed",
            print_job_id: jobId,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }
    return ok(payload);
  } catch (e) {
    return fail(e);
  }
}

export async function handleStationCompleteJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const station = await stations.validateStationAuth(stationTokenHeader(event));
    const job = await printJobs.getPrintJob(jobId);
    if (!job) throw new NotFoundError("print_job");
    assertJobScoped(job, station.tenant_id, station.event_id);
    const okFlag = await printJobs.markPrintComplete(jobId);
    return ok({ updated: !!okFlag, job: await printJobs.getPrintJob(jobId) });
  } catch (e) {
    return fail(e);
  }
}

export async function handleStationFailJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const station = await stations.validateStationAuth(stationTokenHeader(event));
    const job = await printJobs.getPrintJob(jobId);
    if (!job) throw new NotFoundError("print_job");
    assertJobScoped(job, station.tenant_id, station.event_id);
    const body = parseSchema(printJobFailSchema, parseJsonBody(event));
    const okFlag = await printJobs.markPrintFailed(jobId, body.error_message);
    return ok({ updated: !!okFlag, job: await printJobs.getPrintJob(jobId) });
  } catch (e) {
    return fail(e);
  }
}

export async function handleStationTestPrint(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const station = await stations.validateStationAuth(stationTokenHeader(event));
    const body = parseSchema(stationTestPrintSchema, parseJsonBody(event));
    const p = await participants.getParticipant(body.participant_id);
    if (!p) throw new NotFoundError("participant");
    if (p.tenant_id !== station.tenant_id || p.event_id !== station.event_id) {
      throw new NotFoundError("participant");
    }
    const job = await printJobs.enqueueLabelPrintJobAfterCheckIn({
      tenant_id: station.tenant_id,
      event_id: station.event_id,
      participant_id: body.participant_id,
      station_id: station.station_id,
      created_by: "station-test-print",
    });
    if (!job) {
      throw new AppError("Print queue or S3 not configured", { statusCode: 503, code: "PRINT_DISABLED" });
    }
    return created({ print_job: job });
  } catch (e) {
    return fail(e);
  }
}
