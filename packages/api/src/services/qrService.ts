import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import * as participants from "./participants";
import { deleteQrObject, presignGetPng, putPngPublicPrivate } from "./s3Qr";
import type { EventRecord } from "../types/event";
import type { ParticipantRecord } from "../types/participant";

export type QrPayload = {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  qr_token: string;
};

export function generateQRToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function generateQRCodeImage(payload: QrPayload): Promise<Buffer> {
  const json = JSON.stringify(payload);
  return QRCode.toBuffer(json, { type: "png", width: 512, margin: 2, errorCorrectionLevel: "M" });
}

const QR_KEY_PREFIX = "qr-codes";

export function qrS3Key(
  tenantId: string,
  eventId: string,
  participantId: string,
  token: string,
): string {
  return `${QR_KEY_PREFIX}/${tenantId}/${eventId}/${participantId}/${token}.png`;
}

/**
 * Upserts PNG in private S3, stores token + keys on the participant.
 * Caller must enforce tenant/event consent (e.g. ClickFunnels + qr_enabled).
 */
export async function createParticipantQRCode(args: {
  participant: ParticipantRecord;
  event: EventRecord;
}): Promise<{ qr_token: string; qr_url: string; qr_s3_key: string; png: Buffer }> {
  let token = args.participant.qr_token;
  if (!token) token = generateQRToken();
  const payload: QrPayload = {
    tenant_id: args.participant.tenant_id,
    event_id: args.participant.event_id,
    participant_id: args.participant.participant_id,
    qr_token: token,
  };
  const png = await generateQRCodeImage(payload);
  const key = qrS3Key(
    args.participant.tenant_id,
    args.participant.event_id,
    args.participant.participant_id,
    token,
  );
  await putPngPublicPrivate({ key, body: png });

  const qr_url = await presignGetPng({ key, ttlSeconds: 86400 });
  await participants.updateParticipantStates(args.participant.participant_id, {
    qr_token: token,
    qr_s3_key: key,
    qr_url,
  });

  console.log(
    JSON.stringify({
      level: "info",
      msg: "participant_qr_created",
      participant_id: args.participant.participant_id,
      event_id: args.event.event_id,
    }),
  );
  return { qr_token: token, qr_url, qr_s3_key: key, png };
}

export async function validateQRCode(args: {
  qr_token: string;
  tenant_id: string;
  event_id: string;
}): Promise<{ ok: true; participant: ParticipantRecord } | { ok: false; reason: string }> {
  const p = await participants.findByQrToken(args.qr_token);
  if (!p?.qr_token) return { ok: false, reason: "not_found" };
  if (p.qr_token !== args.qr_token) return { ok: false, reason: "token_mismatch" };
  if (p.tenant_id !== args.tenant_id) return { ok: false, reason: "tenant_mismatch" };
  if (p.event_id !== args.event_id) return { ok: false, reason: "event_mismatch" };
  return { ok: true, participant: p };
}

/** Clears Dynamo QR fields (and deletes S3 object when key known); scanner must not trust payload alone afterward. */
export async function revokeQRCode(participantId: string): Promise<void> {
  const existing = await participants.getParticipant(participantId);
  if (!existing) return;
  const key = existing.qr_s3_key;
  if (key) {
    try {
      await deleteQrObject(key);
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "revoke_qr_s3_failed",
          participant_id: participantId,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    }
  }
  await participants.clearQrFields(participantId);
  console.log(JSON.stringify({ level: "info", msg: "participant_qr_revoked", participant_id: participantId }));
}
