import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { readEnv } from "../config/env";
import type { EmailLogRecord, EmailLogStatus, EmailTemplateId } from "../types/emailLog";
import type { EventRecord } from "../types/event";
import type { ParticipantRecord } from "../types/participant";
import { createEmailLogEntry, updateEmailLogEntry } from "./emailLogs";

function sesClient(region: string) {
  return new SESClient({ region });
}

/** Simple `{{key}}` replacement for inline HTML snippets */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function buildMultipartRelatedHtml(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  inlinePng?: { cid: string; buffer: Buffer };
}): string {
  const boundary = `----=_Klients_${Date.now()}`;
  const lines: string[] = [];
  lines.push(`From: ${args.from}`);
  lines.push(`To: ${args.to}`);
  lines.push(`Subject: ${args.subject}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/related; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/html; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: quoted-printable`);
  lines.push("");
  lines.push(encodeQuotedPrintableUtf8(args.html));
  if (args.inlinePng) {
    const b64 = args.inlinePng.buffer.toString("base64");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: image/png; name="qr.png"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push(`Content-ID: <${args.inlinePng.cid}>`);
    lines.push(`Content-Disposition: inline; filename="qr.png"`);
    lines.push("");
    lines.push(chunkBase64(b64));
  }
  lines.push(`--${boundary}--`);
  lines.push("");
  return lines.join("\r\n");
}

function chunkBase64(s: string): string {
  const size = 76;
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out.join("\r\n");
}

/** Minimal QP for UTF-8 HTML bodies (newline → CRLF handled) */
function encodeQuotedPrintableUtf8(html: string): string {
  const utf8 = Buffer.from(html.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8");
  let out = "";
  for (const byte of utf8) {
    if ((byte >= 33 && byte <= 60) || (byte >= 62 && byte <= 126) || byte === 32 || byte === 9) {
      out += String.fromCharCode(byte);
    } else if (byte === 13 || byte === 10) {
      out += String.fromCharCode(byte);
    } else {
      out += `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

async function deliverRawMimeAndLog(params: {
  tenant_id: string;
  event_id?: string;
  participant_id?: string;
  template_id: EmailTemplateId;
  subject: string;
  to_email: string;
  mime: string;
}): Promise<{ email_log_id?: string; ses_message_id?: string }> {
  const env = readEnv();
  const from = env.sesFromEmail;
  if (!from) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "SES_FROM_EMAIL not set — skipping send",
        template_id: params.template_id,
      }),
    );
    return {};
  }

  const queued = await createEmailLogEntry({
    tenant_id: params.tenant_id,
    event_id: params.event_id,
    participant_id: params.participant_id,
    template_id: params.template_id,
    to_email: params.to_email,
    from_email: from,
    subject: params.subject,
    initialStatus: "queued",
  });

  try {
    const raw = Buffer.from(params.mime);
    const res = await sesClient(env.region).send(
      new SendRawEmailCommand({
        Source: from,
        Destinations: [params.to_email],
        RawMessage: { Data: raw },
      }),
    );
    if (queued?.email_log_id) {
      await updateEmailLogEntry(queued.email_log_id, {
        status: "sent",
        ses_message_id: res.MessageId,
      });
    }
    console.log(
      JSON.stringify({
        level: "info",
        msg: "ses_raw_sent",
        template_id: params.template_id,
        to: params.to_email,
        message_id: res.MessageId,
      }),
    );
    return { email_log_id: queued?.email_log_id, ses_message_id: res.MessageId };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (queued?.email_log_id) {
      await updateEmailLogEntry(queued.email_log_id, { status: "failed", error_message: err });
    }
    console.error(JSON.stringify({ level: "error", msg: "ses_raw_failed", template_id: params.template_id, err }));
    throw e;
  }
}

/** Low-level: raw MIME helper (prefer specific send* wrappers for logging/template ids) */
export async function sendEmail(args: {
  tenant_id?: string;
  event_id?: string;
  participant_id?: string;
  template_id?: EmailTemplateId;
  to: string;
  subject: string;
  htmlBody: string;
  inlineQrPng?: Buffer;
}) {
  const env = readEnv();
  const from = env.sesFromEmail;
  if (!from) throw new Error("SES_FROM_EMAIL is not configured");
  const qrCid = "klients_qr_png";
  const html =
    args.inlineQrPng && !args.htmlBody.includes("cid:")
      ? `${args.htmlBody}<p><img src="cid:${qrCid}" alt="QR" width="280" height="280" /></p>`
      : args.htmlBody;
  const mime = buildMultipartRelatedHtml({
    from,
    to: args.to,
    subject: args.subject,
    html,
    inlinePng: args.inlineQrPng ? { cid: qrCid, buffer: args.inlineQrPng } : undefined,
  });
  await deliverRawMimeAndLog({
    tenant_id: args.tenant_id ?? "unknown",
    event_id: args.event_id,
    participant_id: args.participant_id,
    template_id: args.template_id ?? "custom",
    subject: args.subject,
    to_email: args.to,
    mime,
  });
}

/** Persist a row in EmailLogs (e.g. after an external SES send pipeline). */
export async function logEmail(
  params: Omit<Parameters<typeof createEmailLogEntry>[0], "initialStatus"> & {
    status: EmailLogStatus;
  },
): Promise<EmailLogRecord | undefined> {
  return createEmailLogEntry({ ...params, initialStatus: params.status });
}

/** Prefer SendRawEmail flows in this codebase; SES templates are optional ops setup */
export async function sendTemplatedEmail(_args: {
  template_name: string;
  template_data: Record<string, string>;
}) {
  throw new Error(
    "sendTemplatedEmail: configure SES Email Templates in AWS and wire SendTemplatedEmailCommand (phase 6+).",
  );
}

function participantLabel(p: ParticipantRecord) {
  const joined = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.full_name?.trim() || joined || p.email || "participant";
}

function htmlRegistrationBody(
  p: ParticipantRecord,
  evt: EventRecord,
  extras: { webinar_url?: string; location_summary?: string; includeQrBlock: boolean },
) {
  const name = participantLabel(p);
  const qrLine = extras.includeQrBlock
    ? "<p>Tu código QR está en este correo para el check-in el día del evento.</p>"
    : "";

  let locationOrLink = "";
  if (evt.event_type === "webinar" || evt.event_type === "hybrid") {
    const url = extras.webinar_url ?? evt.webinar_url;
    if (url) locationOrLink = `<p>Enlace del webinar: <a href="${url}">${url}</a></p>`;
  }
  if (evt.event_type === "in_person" || evt.event_type === "hybrid") {
    const loc = extras.location_summary?.trim()
      ? extras.location_summary
      : [evt.location_name, evt.location_address].filter(Boolean).join(" — ");
    if (loc) locationOrLink += `<p>Ubicación: ${escapeHtml(loc)}</p>`;
  }

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.45">
<h2>Hola ${escapeHtml(name)},</h2>
<p>Tu registro para <strong>${escapeHtml(evt.title)}</strong> (${escapeHtml(evt.date)}) está confirmado.</p>
${qrLine}
${locationOrLink}
<hr/><p style="color:#555;font-size:14px;">Klients Events — mensaje automatizado por el organizador.</p>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendRegistrationConfirmationEmail(args: {
  tenant_id: string;
  participant: ParticipantRecord;
  event: EventRecord;
  qrPng?: Buffer;
  webinarUrlOverride?: string;
}) {
  const env = readEnv();
  const from = env.sesFromEmail;
  const to = args.participant.email;
  if (!to) throw new Error("Participant email required for SES");
  if (!from) {
    console.warn(JSON.stringify({ level: "warn", msg: "skip_registration_email_no_from" }));
    return;
  }
  const includeQrBlock = !!args.qrPng || !!args.participant.qr_url;
  const html = htmlRegistrationBody(args.participant, args.event, {
    webinar_url: args.webinarUrlOverride,
    includeQrBlock,
  });

  await sendEmail({
    tenant_id: args.tenant_id,
    event_id: args.event.event_id,
    participant_id: args.participant.participant_id,
    template_id: "registration_confirmation",
    to,
    subject: `Registro: ${args.event.title}`,
    htmlBody: html,
    inlineQrPng: args.qrPng,
  });
}

export async function sendTicketEmail(args: {
  tenant_id: string;
  participant: ParticipantRecord;
  event: EventRecord;
  qrPng: Buffer;
}) {
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif">
<h2>Entrada QR</h2>
<p>Hola ${escapeHtml(participantLabel(args.participant))},</p>
<p>Adjuntamos tu QR para el evento <strong>${escapeHtml(args.event.title)}</strong>.</p>
<p style="margin-top:16px;"><img src="cid:klients_qr_png" alt="QR" width="300" /></p></body></html>`;
  await sendEmail({
    tenant_id: args.tenant_id,
    event_id: args.event.event_id,
    participant_id: args.participant.participant_id,
    template_id: "qr_ticket",
    to: args.participant.email!,
    subject: `Tu entrada — ${args.event.title}`,
    htmlBody: html,
    inlineQrPng: args.qrPng,
  });
}

export async function sendConfirmedAfterCallEmail(args: {
  tenant_id: string;
  participant: ParticipantRecord;
  event: EventRecord;
  summary?: string;
  outcomeLabel?: string;
}) {
  const to = args.participant.email;
  if (!to) {
    console.warn(JSON.stringify({ level: "warn", msg: "skip_confirmed_after_call_no_email" }));
    return;
  }
  const name = participantLabel(args.participant);
  const summaryHtml = args.summary?.trim()
    ? `<p style="margin-top:12px;padding:12px;border-radius:8px;background:#f6f7f9"><strong>Resumen de la llamada</strong><br/>${escapeHtml(
        args.summary.trim().slice(0, 4000),
      )}</p>`
    : "";
  const outcome = args.outcomeLabel?.trim()
    ? `<p>Resultado registrado: <strong>${escapeHtml(args.outcomeLabel.trim())}</strong>.</p>`
    : "";
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.45">
<h2>Hola ${escapeHtml(name)},</h2>
<p>Gracias por confirmar tu asistencia a <strong>${escapeHtml(args.event.title)}</strong> (${escapeHtml(
    args.event.date,
  )}).</p>
${outcome}
${summaryHtml}
<p>Si tienes preguntas, responde a este correo o contacta al organizador.</p>
<hr/><p style="color:#555;font-size:14px;">Klients Events — tras tu llamada con el asistente de voz.</p>
</body></html>`;
  await sendEmail({
    tenant_id: args.tenant_id,
    event_id: args.event.event_id,
    participant_id: args.participant.participant_id,
    template_id: "confirmed_after_call",
    to,
    subject: `Confirmamos tu asistencia — ${args.event.title}`,
    htmlBody: html,
  });
}

export async function sendReminderEmail() {
  throw new Error("sendReminderEmail is not implemented yet (Klients Events phase 6).");
}

export async function sendMaterialAccessEmail() {
  throw new Error("sendMaterialAccessEmail is not implemented yet (Klients Events phase 3+).");
}

export async function sendWebinarLinkEmail() {
  throw new Error("sendWebinarLinkEmail is not implemented yet (Klients Events phase 6).");
}

export async function sendPostEventEmail() {
  throw new Error("sendPostEventEmail is not implemented yet (Klients Events phase 6).");
}
