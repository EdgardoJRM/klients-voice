import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as printJobs from "../../services/printJobs";
import { presignGetObject } from "../../services/s3Qr";
import { printJobClaimSchema } from "../../schemas/materials.schema";
import { AppError, NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleClaimPrintJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const raw = (() => {
      try {
        return event.body ? (parseJsonBody(event) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();
    const body = parseSchema(printJobClaimSchema, raw);
    const job = await printJobs.getPrintJob(jobId);
    if (!job) throw new NotFoundError("print_job");
    middleware.assertTenantAccess(ctx, job.tenant_id);
    const claimed = await printJobs.claimPrintJob(jobId, body.station_id);
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
            msg: "print_job_claim_presign_failed",
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
