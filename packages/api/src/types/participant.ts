export type RegistrationStatus =
  | "registered"
  | "cancelled"
  | "attended"
  | "no_show";

export type AttendanceStatus =
  | "pending"
  | "confirmed"
  | "maybe"
  | "cancelled"
  | "no_answer"
  | "needs_human_followup";

export type ParticipantCallStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer"
  | "voicemail";

export type ParticipantAccessStatus = "locked" | "unlocked";

export type ParticipantRecord = {
  participant_id: string;
  tenant_id: string;
  event_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  normalized_phone?: string;
  company_name?: string;
  source?: string;
  source_funnel?: string;
  source_page?: string;
  registration_status: RegistrationStatus;
  attendance_status: AttendanceStatus;
  call_status: ParticipantCallStatus;
  consent_voice: boolean;
  consent_sms?: boolean;
  consent_email?: boolean;
  custom_fields?: Record<string, unknown>;
  retry_count: number;
  last_call_at?: string;
  next_call_at?: string;
  last_call_result?: string;
  notes?: string;
  email_pending?: boolean;
  sms_pending?: boolean;
  opt_out_voice?: boolean;
  qr_token?: string;
  qr_s3_key?: string;
  qr_url?: string;
  ticket_pdf_url?: string;
  checked_in?: boolean;
  checked_in_at?: string;
  checked_in_by?: string;
  access_status?: ParticipantAccessStatus;
  created_at: string;
  updated_at: string;
};
