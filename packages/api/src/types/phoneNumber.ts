export type PhoneNumberType =
  | "twilio_owned"
  | "verified_caller_id"
  | "sip"
  | "external";

export type PhoneRecordStatus = "active" | "inactive";

export type PhoneNumberRecord = {
  phone_number_id: string;
  tenant_id: string;
  provider: "twilio";
  phone_number: string;
  phone_number_type: PhoneNumberType;
  elevenlabs_phone_number_id?: string;
  label?: string;
  supports_inbound: boolean;
  supports_outbound: boolean;
  status: PhoneRecordStatus;
  created_at: string;
  updated_at: string;
};
