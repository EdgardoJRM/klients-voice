export type CallType = "confirmation" | "reminder" | "followup" | "custom";

export type CallOutcome =
  | "confirmed"
  | "cancelled"
  | "maybe"
  | "no_answer"
  | "voicemail"
  | "needs_human_followup"
  | "wrong_number"
  | "failed";

export type CallLogRecord = {
  call_log_id: string;
  tenant_id: string;
  event_id: string;
  participant_id: string;
  call_type: CallType;
  provider: "elevenlabs";
  twilio_call_sid?: string;
  elevenlabs_conversation_id?: string;
  from_number?: string;
  to_number?: string;
  status: string;
  outcome?: CallOutcome;
  transcript?: unknown;
  summary?: string;
  recording_url?: string;
  duration_seconds?: number;
  cost_estimate?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
