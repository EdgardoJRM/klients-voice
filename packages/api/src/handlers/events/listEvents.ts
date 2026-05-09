import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { ValidationError } from "../../utils/errors";
import { parseSchema } from "../../utils/validation";
import { listEventsQuerySchema } from "../../schemas/event.schema";
import * as events from "../../services/events";
import { ok, fail } from "../../utils/response";

export async function handleListEvents(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const tenantId = event.queryStringParameters?.tenant_id;
    if (!tenantId) throw new ValidationError("tenant_id query parameter required");
    const q = parseSchema(listEventsQuerySchema, {
      tenant_id: tenantId,
    });
    middleware.assertTenantAccess(ctx, q.tenant_id);
    const list = await events.listEventsByTenant(q.tenant_id);
    return ok(list.sort((a, b) => a.date.localeCompare(b.date)));
  } catch (e) {
    return fail(e);
  }
}
