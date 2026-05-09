import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { readEnv } from "../../config/env";
import { ok, fail } from "../../utils/response";
import { resolveTenantBySlug } from "../../utils/tenantResolver";
import { ValidationError } from "../../utils/errors";
import { normalizePhoneE164 } from "../../utils/phone";
import { coerceBool, extractClickfunnelsInner } from "../../utils/clickfunnels";
import { clickfunnelsWebhookSchema } from "../../schemas/webhook.schema";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import * as qrService from "../../services/qrService";
import * as ses from "../../services/ses";
import crypto from "node:crypto";

function verifyClickfunnelsTrust(args: {
  rawBody: string;
  headerToken?: string | null;
  configuredSecret?: string;
}): boolean {
  if (!args.configuredSecret) return true;
  if (!args.headerToken) return false;
  const a = Buffer.from(args.headerToken.trim(), "utf8");
  const b = Buffer.from(args.configuredSecret, "utf8");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function pickTitle(inner: Record<string, unknown>) {
  return (
    (inner.event_title as string | undefined) ??
    (inner.event_name as string | undefined) ??
    (inner.workshop_name as string | undefined) ??
    (inner.webinar_name as string | undefined)
  )?.trim();
}

function pickDate(inner: Record<string, unknown>) {
  return ((inner.event_date as string | undefined) ?? (inner.date as string | undefined))?.trim();
}

function pickTime(inner: Record<string, unknown>) {
  return ((inner.event_time as string | undefined) ?? (inner.time as string | undefined))?.trim();
}

export async function handleClickfunnelsWebhook(
  event: APIGatewayProxyEventV2,
  tenantSlugPath: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const env = readEnv();
    const raw =
      event.isBase64Encoded && event.body
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body ?? "{}";
    const shared =
      event.headers["x-klients-signature"] ??
      event.headers["X-Klients-Signature"] ??
      event.headers["x-webhook-secret"];
    if (
      env.clickfunnelsWebhookSecret &&
      !verifyClickfunnelsTrust({
        rawBody: raw,
        headerToken: shared ?? null,
        configuredSecret: env.clickfunnelsWebhookSecret,
      })
    ) {
      return { statusCode: 401, body: JSON.stringify({ success: false }) };
    }

    const tenant = await resolveTenantBySlug(tenantSlugPath);
    if (!tenant || tenant.status !== "active") {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: "tenant" }) };
    }

    const parsed = JSON.parse(raw) as unknown;
    const body = clickfunnelsWebhookSchema.safeParse(parsed);
    if (!body.success) throw new ValidationError("Invalid payload", body.error.flatten());
    const inner = extractClickfunnelsInner(body.data as Record<string, unknown>);

    const fullName =
      (inner.full_name as string | undefined)?.trim() ??
      [inner.first_name as string, inner.last_name as string].filter(Boolean).join(" ").trim() ??
      (inner.name as string | undefined)?.trim();

    const email = (inner.email as string | undefined)?.trim();
    const phone = inner.phone as string | undefined;
    const consent_voice = coerceBool(inner.consent_voice);
    const normalized_phone = normalizePhoneE164(phone, env.defaultPhoneRegion);

    let eventId = inner.event_id as string | undefined;
    let resolved = eventId ? await events.getEvent(eventId) : undefined;
    if ((!resolved || resolved.tenant_id !== tenant.tenant_id) && eventId) {
      resolved = undefined;
      eventId = undefined;
    }

    if (!resolved) {
      const title = pickTitle(inner);
      const date = pickDate(inner);
      if (title && date) {
        resolved = await events.findEventByTenantTitleDate(tenant.tenant_id, title, date);
        eventId = resolved?.event_id;
      }
    }

    if (!resolved || !eventId) {
      return { statusCode: 200, body: JSON.stringify({ success: true, accepted: false }) };
    }

    const startTime = pickTime(inner);
    const webinarUrl = inner.webinar_url as string | undefined;
    const titleIncoming = pickTitle(inner);
    if (titleIncoming) {
      await events.updateEventFields(eventId, {
        title: titleIncoming,
      });
    }

    if (!email && !normalized_phone) {
      return { statusCode: 200, body: JSON.stringify({ success: true, accepted: false }) };
    }

    const inferredType = (inner.event_type as string | undefined) ?? resolved.event_type;

    const saved = await participants.upsertParticipant({
      tenant_id: tenant.tenant_id,
      event_id: eventId,
      first_name: (inner.first_name as string | undefined) ?? fullName?.split(" ")[0],
      last_name: inner.last_name as string | undefined,
      full_name: fullName,
      email,
      phone,
      normalized_phone,
      company_name: inner.company_name as string | undefined,
      source: "clickfunnels",
      source_funnel: inner.source_funnel as string | undefined,
      source_page: inner.source_page as string | undefined,
      registration_status: "registered",
      attendance_status: "pending",
      call_status: "pending",
      consent_voice,
      consent_sms: coerceBool(inner.consent_sms),
      consent_email: coerceBool(inner.consent_email),
      custom_fields: {
        ...inner,
        inferred_event_type: inferredType,
        webhook_start_time: startTime,
        webinar_url: webinarUrl,
      },
      retry_count: 0,
    });

    const consent_email = saved.consent_email === true;

    try {
      if (saved.email && consent_email && env.sesFromEmail) {
        let qrPng: Buffer | undefined;
        if (resolved.qr_enabled) {
          if (env.s3BucketAssets) {
            const qr = await qrService.createParticipantQRCode({
              participant: saved,
              event: resolved,
            });
            qrPng = qr.png;
          } else {
            console.warn(
              JSON.stringify({
                level: "warn",
                msg: "qr_enabled_but_missing_s3_bucket_assets",
                event_id: eventId,
              }),
            );
          }
        }

        const latestParticipant = (await participants.getParticipant(saved.participant_id)) ?? saved;

        await ses.sendRegistrationConfirmationEmail({
          tenant_id: tenant.tenant_id,
          participant: latestParticipant,
          event: resolved,
          qrPng,
          webinarUrlOverride: webinarUrl,
        });
      } else if (saved.email && !consent_email) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "skip_registration_email_no_email_consent",
            participant_id: saved.participant_id,
          }),
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(
        JSON.stringify({
          level: "error",
          msg: "registration_email_pipeline_failed",
          participant_id: saved.participant_id,
          error: err,
        }),
      );
    }

    return ok({ accepted: true });
  } catch (e) {
    return fail(e);
  }
}
