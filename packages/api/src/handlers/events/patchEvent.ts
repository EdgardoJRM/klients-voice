import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { patchEventSchema } from "../../schemas/event.schema";
import * as events from "../../services/events";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handlePatchEvent(
  event: APIGatewayProxyEventV2,
  eventId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, evt.tenant_id);

    const raw = parseJsonBody(event);
    const parsed = parseSchema(patchEventSchema, raw);
    if (Object.keys(parsed).length === 0) {
      throw new ValidationError("Provide at least one field to patch");
    }

    const nextWebinarUrl = parsed.webinar_url !== undefined ? parsed.webinar_url : evt.webinar_url;
    const eventType = evt.event_type;
    if ((eventType === "webinar" || eventType === "hybrid") && !nextWebinarUrl?.trim()) {
      throw new ValidationError("webinar_url required for webinar/hybrid events");
    }

    await events.updateEventFields(eventId, parsed);
    const updated = await events.getEvent(eventId);
    return ok(updated ?? evt);
  } catch (e) {
    return fail(e);
  }
}
