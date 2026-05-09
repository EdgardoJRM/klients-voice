export type EventType =
  | "in_person"
  | "webinar"
  | "hybrid"
  | "phone_consultation"
  | "custom";

export type WebinarPlatform =
  | "zoom"
  | "google_meet"
  | "teams"
  | "custom"
  | "none";

export type EventStatus = "draft" | "active" | "completed" | "cancelled";

export type CallCampaignStatus =
  | "not_started"
  | "scheduled"
  | "running"
  | "completed";

export type EventRecord = {
  event_id: string;
  tenant_id: string;
  event_type: EventType;
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  date: string;
  start_time?: string;
  end_time?: string;
  timezone: string;
  location_name?: string;
  location_address?: string;
  webinar_platform: WebinarPlatform;
  webinar_url?: string;
  replay_url?: string;
  host_name?: string;
  status: EventStatus;
  call_campaign_status: CallCampaignStatus;
  confirmation_call_enabled: boolean;
  reminder_call_enabled: boolean;
  followup_call_enabled: boolean;
  max_call_retries: number;
  call_window_start?: string;
  call_window_end?: string;
  /** When true (and consent), participants receive QR + ticket-style email via SES */
  qr_enabled?: boolean;
  /** After check-in, enqueue a thermal label PDF print job */
  print_labels_enabled?: boolean;
  /** Gate dashboard / API scanner UX (server still validates QR) */
  scanner_enabled?: boolean;
  /** Hide or simplify materials UX when false */
  materials_enabled?: boolean;
  /** Optional rule hint for gated materials (string for MVP; extend to enum later) */
  protected_access_rule?: string;
  /** Prefer this label template when generating jobs; omit for default generator */
  selected_label_template_id?: string;
  created_at: string;
  updated_at: string;
};
