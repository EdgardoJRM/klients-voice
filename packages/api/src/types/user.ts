export type UserRole = "super_admin" | "agency_admin" | "tenant_admin" | "staff";

export type UserStatus = "active" | "inactive";

export type AppUser = {
  user_id: string;
  tenant_id?: string | null;
  /** agency_admin-only: comma-separated tenant_ids or JSON array string stored in Dynamo */
  managed_tenant_ids?: string[];
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};
