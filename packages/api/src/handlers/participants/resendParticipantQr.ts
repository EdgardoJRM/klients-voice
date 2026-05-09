import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import { generateQRCodeImage } from "../../services/qrService";
import * as ses from "../../services/ses";
import { AppError, NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleResendParticipantQr(
  event: APIGatewayProxyEventV2,
  eventId: string,
  participantId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);

    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");

    const p = await participants.getParticipant(participantId);
    if (!p || p.event_id !== eventId) throw new NotFoundError("participant");

    middleware.assertTenantAccess(ctx, p.tenant_id);
    if (p.tenant_id !== evt.tenant_id) {
      throw new AppError("Participant does not belong to this event", {
        statusCode: 400,
        code: "EVENT_PARTICIPANT_MISMATCH",
      });
    }

    if (!p.email) {
      throw new AppError("Participant has no email", { statusCode: 400, code: "NO_EMAIL" });
    }
    if (p.consent_email !== true) {
      throw new AppError("Participant has not consented to email", {
        statusCode: 403,
        code: "EMAIL_CONSENT_REQUIRED",
      });
    }

    const token = p.qr_token;
    if (!token) {
      throw new AppError("Participant has no QR token; register with qr_enabled or recreate QR.", {
        statusCode: 400,
        code: "NO_QR",
      });
    }

    const png = await generateQRCodeImage({
      tenant_id: p.tenant_id,
      event_id: p.event_id,
      participant_id: p.participant_id,
      qr_token: token,
    });

    await ses.sendTicketEmail({
      tenant_id: p.tenant_id,
      participant: p,
      event: evt,
      qrPng: png,
    });

    console.log(
      JSON.stringify({
        msg: "resend_participant_qr",
        participant_id: p.participant_id,
        event_id: evt.event_id,
      }),
    );

    return ok({ sent: true, participant_id: p.participant_id });
  } catch (e) {
    return fail(e);
  }
}
