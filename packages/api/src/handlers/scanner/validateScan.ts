import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import { validateQRCode } from "../../services/qrService";
import { scannerValidateSchema } from "../../schemas/scanner.schema";
import { enqueueLabelPrintJobAfterCheckIn } from "../../services/printJobs";
import { AppError, NotFoundError } from "../../utils/errors";
import { nowIso } from "../../utils/dates";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

function qrValidationError(reason: string): AppError {
  switch (reason) {
    case "not_found":
      return new AppError("QR token unknown or revoked", {
        statusCode: 404,
        code: "INVALID_QR",
      });
    case "token_mismatch":
      return new AppError("QR token mismatch", { statusCode: 400, code: "INVALID_QR" });
    case "tenant_mismatch":
      return new AppError("QR does not belong to this tenant", {
        statusCode: 403,
        code: "TENANT_MISMATCH",
      });
    case "event_mismatch":
      return new AppError("QR does not belong to this event", {
        statusCode: 403,
        code: "EVENT_MISMATCH",
      });
    default:
      return new AppError("QR validation failed", { statusCode: 400, code: "INVALID_QR" });
  }
}

export async function handleScannerValidate(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);

    const body = parseSchema(scannerValidateSchema, parseJsonBody(event));

    const evt = await events.getEvent(body.event_id);
    if (!evt) throw new NotFoundError("event");

    middleware.assertTenantAccess(ctx, body.tenant_id);
    if (evt.tenant_id !== body.tenant_id) {
      throw new AppError("Body tenant_id does not match event", {
        statusCode: 403,
        code: "TENANT_EVENT_MISMATCH",
      });
    }

    const result = await validateQRCode({
      qr_token: body.qr_token.trim(),
      tenant_id: body.tenant_id,
      event_id: body.event_id,
    });
    if (!result.ok) {
      console.log(
        JSON.stringify({
          msg: "scanner_validate",
          outcome: "invalid",
          reason: result.reason,
          event_id: body.event_id,
          tenant_id: body.tenant_id,
          station_id: body.station_id,
        }),
      );
      throw qrValidationError(result.reason);
    }

    const p = result.participant;

    if (p.checked_in === true) {
      console.log(
        JSON.stringify({
          msg: "scanner_validate",
          outcome: "already_checked_in",
          participant_id: p.participant_id,
          event_id: body.event_id,
          station_id: body.station_id,
        }),
      );
      return ok({
        participant: p,
        warning: "already_checked_in" as const,
        scanned_at: null,
      });
    }

    const checkedIso = nowIso();
    await participants.updateParticipantStates(p.participant_id, {
      checked_in: true,
      checked_in_at: checkedIso,
      checked_in_by: body.scanned_by,
      registration_status: "attended",
      access_status: "unlocked",
    });

    const updated = await participants.getParticipant(p.participant_id);

    console.log(
      JSON.stringify({
        msg: "scanner_validate",
        outcome: "checked_in",
        participant_id: p.participant_id,
        event_id: body.event_id,
        station_id: body.station_id,
      }),
    );

    if (evt.print_labels_enabled === true) {
      void enqueueLabelPrintJobAfterCheckIn({
        tenant_id: body.tenant_id,
        event_id: body.event_id,
        participant_id: p.participant_id,
        station_id: body.station_id,
        created_by: body.scanned_by,
      }).catch((err) =>
        console.error(
          JSON.stringify({
            msg: "print_job_enqueue_failed",
            participant_id: p.participant_id,
            err: err instanceof Error ? err.message : String(err),
          }),
        ),
      );
    }

    return ok({
      participant: updated ?? { ...p, checked_in: true, checked_in_at: checkedIso, checked_in_by: body.scanned_by },
      scanned_at: checkedIso,
    });
  } catch (e) {
    return fail(e);
  }
}
