import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as printJobs from "../../services/printJobs";
import { printJobFailSchema } from "../../schemas/materials.schema";
import { NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleFailPrintJob(
  event: APIGatewayProxyEventV2,
  jobId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(printJobFailSchema, parseJsonBody(event));
    const job = await printJobs.getPrintJob(jobId);
    if (!job) throw new NotFoundError("print_job");
    middleware.assertTenantAccess(ctx, job.tenant_id);
    await printJobs.markPrintFailed(jobId, body.error_message);
    return ok({ job: await printJobs.getPrintJob(jobId) });
  } catch (e) {
    return fail(e);
  }
}
