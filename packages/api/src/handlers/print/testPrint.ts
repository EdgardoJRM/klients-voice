import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import * as printJobs from "../../services/printJobs";
import { testPrintSchema } from "../../schemas/materials.schema";
import { AppError, NotFoundError } from "../../utils/errors";
import { created, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleTestPrint(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(testPrintSchema, parseJsonBody(event));
    const evt = await events.getEvent(body.event_id);
    if (!evt) throw new NotFoundError("event");
    const p = await participants.getParticipant(body.participant_id);
    if (!p) throw new NotFoundError("participant");
    middleware.assertTenantAccess(ctx, body.tenant_id);
    if (evt.tenant_id !== body.tenant_id || p.tenant_id !== body.tenant_id || p.event_id !== body.event_id) {
      throw new NotFoundError("participant");
    }
    const job = await printJobs.enqueueLabelPrintJobAfterCheckIn({
      tenant_id: body.tenant_id,
      event_id: body.event_id,
      participant_id: body.participant_id,
      station_id: body.station_id,
      created_by: "test-print",
    });
    if (!job) {
      throw new AppError("Print queue or S3 not configured", { statusCode: 503, code: "PRINT_DISABLED" });
    }
    return created({ print_job: job });
  } catch (e) {
    return fail(e);
  }
}
