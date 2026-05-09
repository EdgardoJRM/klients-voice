import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as printJobs from "../../services/printJobs";
import { NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleCompletePrintJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const job = await printJobs.getPrintJob(jobId);
    if (!job) throw new NotFoundError("print_job");
    middleware.assertTenantAccess(ctx, job.tenant_id);
    const okFlag = await printJobs.markPrintComplete(jobId);
    if (!okFlag) {
      return ok({ updated: false, job: await printJobs.getPrintJob(jobId) });
    }
    return ok({ updated: true, job: await printJobs.getPrintJob(jobId) });
  } catch (e) {
    return fail(e);
  }
}
