import type { Tenant } from "../types/tenant";
import * as tenants from "../services/tenants";

export async function resolveTenantBySlug(slug: string): Promise<Tenant | undefined> {
  return tenants.getBySlug(slug);
}
