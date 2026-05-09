import { z } from "zod";

const tenantStatusSchema = z.enum(["active", "inactive", "suspended"]);
const tenantPlanSchema = z.enum(["starter", "pro", "agency", "enterprise"]);
const langSchema = z.enum(["es", "en"]);

const brandingSchema = z
  .object({
    logo_url: z.string().url().optional(),
    primary_color: z.string().max(64).optional(),
    secondary_color: z.string().max(64).optional(),
    accent_color: z.string().max(64).optional(),
  })
  .strict();

export const createTenantSchema = z
  .object({
    tenant_name: z.string().min(1).max(200),
    tenant_slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, "Slug must be kebab-safe")
      .max(128),
    business_name: z.string().min(1).max(200),
    contact_email: z.string().email(),
    contact_phone: z.string().optional(),
    plan: tenantPlanSchema,
    timezone: z.string().min(1).max(80),
    default_language: langSchema.optional(),
    branding: brandingSchema.optional(),
  })
  .strict();

export const tenantResponseSchema = z
  .object({
    tenant_id: z.string().uuid(),
    tenant_slug: z.string(),
    tenant_name: z.string(),
    business_name: z.string(),
    contact_email: z.string(),
    contact_phone: z.string().optional(),
    status: tenantStatusSchema,
    plan: tenantPlanSchema,
    branding: brandingSchema.default({}),
    default_language: langSchema,
    timezone: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();
