import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as participants from "../../services/participants";
import * as materials from "../../services/materials";
import * as materialAccess from "../../services/materialAccess";
import { participantCanAccessMaterial } from "../../services/materialAccessRules";
import { NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

export async function handleListParticipantMaterials(
  event: APIGatewayProxyEventV2,
  participantId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const p = await participants.getParticipant(participantId);
    if (!p) throw new NotFoundError("participant");
    middleware.assertTenantAccess(ctx, p.tenant_id);
    const mats = await materials.listMaterialsByEvent(p.event_id);
    const accessRows = await materialAccess.listAccessForParticipant(participantId);
    const rowByMid = new Map(accessRows.map((r) => [r.material_id, r]));
    const payload = mats.map((m) => {
      const ar = rowByMid.get(m.material_id);
      const can_access = participantCanAccessMaterial({ material: m, participant: p, accessRow: ar });
      return {
        ...m,
        can_access,
        explicit_access_status: ar?.access_status ?? null,
      };
    });
    return ok(payload);
  } catch (e) {
    return fail(e);
  }
}
