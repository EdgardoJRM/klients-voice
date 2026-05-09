import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import { NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleGetEvent(
  event: APIGatewayProxyEventV2,
  eventId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, evt.tenant_id);
    return ok(evt);
  } catch (e) {
    return fail(e);
  }
}
