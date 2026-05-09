import type { PhoneNumberRecord } from "../types/phoneNumber";
import * as phones from "./phoneNumbers";

/** Twilio phone info for audits / future REST calls */
export async function getConfiguredPhone(recordId: string): Promise<PhoneNumberRecord | undefined> {
  return phones.getPhoneById(recordId);
}

/** Verified Caller Id provisioning — extend with Twilio REST when needed */
export async function verifyCallerId(): Promise<{ status: string }> {
  return { status: "not_implemented" };
}
