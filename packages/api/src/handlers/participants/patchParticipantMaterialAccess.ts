import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import { materialAccessBodySchema } from "../../schemas/scanner.schema";
import { AppError, NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handlePatchParticipantMaterialAccess(
  event: APIGatewayProxyEventV2,
  eventId: string,
  participantId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);

    const body = parseSchema(materialAccessBodySchema, parseJsonBody(event));

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

    await participants.updateParticipantStates(p.participant_id, {
      access_status: body.unlocked ? "unlocked" : "locked",
    });

    const updated = await participants.getParticipant(participantId);

    console.log(
      JSON.stringify({
        msg: "material_access_manual",
        participant_id: participantId,
        event_id: eventId,
        unlocked: body.unlocked,
      }),
    );

    return ok({
      participant: updated ?? undefined,
      access_status: updated?.access_status,
    });
  } catch (e) {
    return fail(e);
  }
}
