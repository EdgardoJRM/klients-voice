import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as printJobs from "../../services/printJobs";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleListPrintJobs(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const eventId = event.queryStringParameters?.event_id;
    if (!eventId) throw new ValidationError("event_id query required");
    const stationId = event.queryStringParameters?.station_id ?? undefined;
    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, evt.tenant_id);
    const jobs = await printJobs.listQueuedJobsForEvent(eventId, stationId);
    return ok(jobs);
  } catch (e) {
    return fail(e);
  }
}
