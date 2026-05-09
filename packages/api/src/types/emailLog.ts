export type EmailProvider = "ses";

export type EmailLogStatus = "queued" | "sent" | "failed" | "bounced" | "complained";

/** template_id aligns with SES template naming / app constants */
export type EmailTemplateId =
  | "registration_confirmation"
  | "qr_ticket"
  | "reminder"
  | "confirmed_after_call"
  | "webinar_link"
  | "material_access"
  | "post_event"
  | "magic_link"
  | "custom";

export type EmailLogRecord = {
  email_log_id: string;
  tenant_id: string;
  event_id?: string;
  participant_id?: string;
  template_id: EmailTemplateId;
  to_email: string;
  from_email: string;
  subject: string;
  provider: EmailProvider;
  status: EmailLogStatus;
  ses_message_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
};
