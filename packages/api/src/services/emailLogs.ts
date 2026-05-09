import { randomUUID } from "crypto";
import { readEnv } from "../config/env";
import type { EmailLogRecord, EmailLogStatus, EmailTemplateId } from "../types/emailLog";
import { ddPut, ddUpdate, getDocClient } from "./dynamodb";
import { nowIso } from "../utils/dates";

function tableOrSkip(): string | undefined {
  return readEnv().tableEmailLogs;
}

export async function createEmailLogEntry(input: {
  tenant_id: string;
  event_id?: string;
  participant_id?: string;
  template_id: EmailTemplateId;
  to_email: string;
  from_email: string;
  subject: string;
  initialStatus: EmailLogStatus;
  error_message?: string;
}): Promise<EmailLogRecord | undefined> {
  const tbl = tableOrSkip();
  if (!tbl) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "TABLE_EMAIL_LOGS not set — skipping email log persistence",
      }),
    );
    return undefined;
  }
  const env = readEnv();
  const client = getDocClient(env.region);
  const now = nowIso();
  const rec: EmailLogRecord = {
    email_log_id: randomUUID(),
    tenant_id: input.tenant_id,
    event_id: input.event_id,
    participant_id: input.participant_id,
    template_id: input.template_id,
    to_email: input.to_email,
    from_email: input.from_email,
    subject: input.subject,
    provider: "ses",
    status: input.initialStatus,
    error_message: input.error_message,
    created_at: now,
    updated_at: now,
  };
  await ddPut({ client, table: tbl, item: rec as unknown as Record<string, unknown> });
  return rec;
}

export async function updateEmailLogEntry(
  emailLogId: string,
  patch: Pick<Partial<EmailLogRecord>, "status" | "ses_message_id" | "error_message">,
): Promise<void> {
  const tbl = tableOrSkip();
  if (!tbl) return;
  const env = readEnv();
  const client = getDocClient(env.region);
  const names: Record<string, string> = { "#u": "updated_at" };
  const values: Record<string, unknown> = { ":u": nowIso() };
  const sets = ["#u = :u"];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#k${i}`;
    const vk = `:v${i}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }
  await ddUpdate({
    client,
    table: tbl,
    key: { email_log_id: emailLogId },
    updateExpression: `SET ${sets.join(", ")}`,
    names,
    values,
  });
}
