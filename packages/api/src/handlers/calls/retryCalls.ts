import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { parseSchema } from "../../utils/validation";
import { retryCallsSchema } from "../../schemas/call.schema";
import { parseJsonBody, ok, fail } from "../../utils/response";
import { runStartCalls } from "./startCalls";

export async function handleRetryCalls(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const body = parseJsonBody(event);
    const input = parseSchema(retryCallsSchema, body);
    middleware.assertTenantAccess(ctx, input.tenant_id);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const summary = await runStartCalls({
      ...input,
      filter: "no_answer_only",
    });
    return ok(summary);
  } catch (e) {
    return fail(e);
  }
}
