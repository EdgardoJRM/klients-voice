export type TenantStatus = "active" | "inactive" | "suspended";
export type TenantPlan = "starter" | "pro" | "agency" | "enterprise";
export type SupportedLanguage = "es" | "en";

export type TenantBranding = {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
};

export type Tenant = {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  business_name: string;
  contact_email: string;
  contact_phone?: string;
  status: TenantStatus;
  plan: TenantPlan;
  branding: TenantBranding;
  default_language: SupportedLanguage;
  timezone: string;
  created_at: string;
  updated_at: string;
};
