export type PrintJobStatus =
  | "queued"
  | "claimed"
  | "printing"
  | "printed"
  | "failed"
  | "cancelled";

export type PrinterStationStatus = "online" | "offline" | "error" | "pending_pairing";

export type PrintMode = "auto" | "manual_approval";

export type PrintJobRecord = {
  print_job_id: string;
  tenant_id: string;
  event_id: string;
  participant_id: string;
  station_id?: string;
  printer_id?: string;
  label_template_id?: string;
  label_s3_key?: string;
  label_url?: string;
  status: PrintJobStatus;
  attempts: number;
  error_message?: string;
  created_by?: string;
  created_at: string;
  claimed_at?: string;
  printed_at?: string;
  updated_at: string;
  /** GSI EventQueueIndex sort key `{STATUS}#{iso}#{print_job_id}` */
  evt_queue_sk?: string;
};

export type PrinterStationRecord = {
  station_id: string;
  tenant_id: string;
  event_id: string;
  /** GSI TenantEventStationIndex partition `{tenant_id}#{event_id}` */
  tenant_event_sk?: string;
  station_name?: string;
  device_name?: string;
  local_app_version?: string;
  status: PrinterStationStatus;
  last_seen_at?: string;
  assigned_printer_name?: string;
  print_mode: PrintMode;
  pairing_code_hash?: string;
  /** ISO expiry for pending_pairing pairing flow */
  pairing_expires_at?: string;
  api_key_hash?: string;
  created_at: string;
  updated_at: string;
};

export type LabelSizePreset = "4x6" | "2x1" | "3x2" | "custom";

export type LabelTemplateRecord = {
  label_template_id: string;
  tenant_id: string;
  name: string;
  size: LabelSizePreset;
  width?: number;
  height?: number;
  orientation?: "portrait" | "landscape";
  design_config?: Record<string, unknown>;
  variables?: string[];
  created_at: string;
  updated_at: string;
};
