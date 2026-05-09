import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import { NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleGetEventParticipants(
  event: APIGatewayProxyEventV2,
  eventId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, evt.tenant_id);
    const list = await participants.listByEvent(eventId);
    return ok(list);
  } catch (e) {
    return fail(e);
  }
}
