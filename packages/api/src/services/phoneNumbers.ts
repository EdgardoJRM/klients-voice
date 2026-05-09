import { readEnv } from "../config/env";
import type { PhoneNumberRecord } from "../types/phoneNumber";
import { ddGet, getDocClient } from "./dynamodb";

export async function getPhoneById(id: string): Promise<PhoneNumberRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const item = await ddGet({
    client,
    table: env.tablePhoneNumbers,
    key: { phone_number_id: id },
  });
  return item as PhoneNumberRecord | undefined;
}
