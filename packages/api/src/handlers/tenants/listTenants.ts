import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as tenants from "../../services/tenants";
import { ok, fail } from "../../utils/response";

export async function handleListTenants(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin"]);
    const all = await tenants.listTenants();
    const managed = ctx.dbUser?.managed_tenant_ids;
    const filtered =
      middleware.roleOf(ctx) === "agency_admin" && managed && managed.length
        ? all.filter((t) => managed.includes(t.tenant_id))
        : all;
    return ok(filtered);
  } catch (e) {
    return fail(e);
  }
}
