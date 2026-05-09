import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as materials from "../../services/materials";
import * as materialAccessSvc from "../../services/materialAccess";
import * as participants from "../../services/participants";
import { grantMaterialAccessSchema } from "../../schemas/materials.schema";
import { NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleGrantMaterialAccess(
  event: APIGatewayProxyEventV2,
  materialId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(grantMaterialAccessSchema, parseJsonBody(event));
    const m = await materials.getMaterial(materialId);
    if (!m) throw new NotFoundError("material");
    const p = await participants.getParticipant(body.participant_id);
    if (!p) throw new NotFoundError("participant");
    const evt = await events.getEvent(m.event_id);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, m.tenant_id);
    if (p.event_id !== m.event_id || p.tenant_id !== m.tenant_id) {
      throw new NotFoundError("participant");
    }
    const rec = await materialAccessSvc.setParticipantMaterialAccess({
      tenant_id: m.tenant_id,
      event_id: m.event_id,
      participant_id: p.participant_id,
      material_id: m.material_id,
      access_status: body.access_status,
    });
    return ok(rec);
  } catch (e) {
    return fail(e);
  }
}
