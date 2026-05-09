export type IntegrationProvider =
  | "clickfunnels"
  | "elevenlabs"
  | "twilio"
  | "zapier"
  | "make"
  | "suretriggers"
  | "zoom"
  | "custom";

export type IntegrationStatus = "active" | "inactive";

export type IntegrationRecord = {
  integration_id: string;
  tenant_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, unknown>;
  secrets_reference?: string;
  created_at: string;
  updated_at: string;
};
