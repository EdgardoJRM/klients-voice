import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { parseSchema } from "../../utils/validation";
import { createTenantSchema } from "../../schemas/tenant.schema";
import * as tenants from "../../services/tenants";
import { created, parseJsonBody, fail } from "../../utils/response";
import type { Tenant } from "../../types/tenant";

export async function handleCreateTenant(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin"]);
    const body = parseJsonBody(event);
    const input = parseSchema(createTenantSchema, body);
    const tenant: Omit<Tenant, "tenant_id" | "created_at" | "updated_at"> = {
      tenant_slug: input.tenant_slug,
      tenant_name: input.tenant_name,
      business_name: input.business_name,
      contact_email: input.contact_email,
      contact_phone: input.contact_phone,
      status: "active",
      plan: input.plan,
      branding: input.branding ?? {},
      default_language: input.default_language ?? "es",
      timezone: input.timezone,
    };
    const createdTenant = await tenants.createTenant(tenant);
    return created(createdTenant);
  } catch (e) {
    return fail(e);
  }
}
