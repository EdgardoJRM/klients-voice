import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as materialsSvc from "../../services/materials";
import { attachMaterialAssetSchema } from "../../schemas/materials.schema";
import { AppError, NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleAttachMaterialAsset(
  event: APIGatewayProxyEventV2,
  materialId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(attachMaterialAssetSchema, parseJsonBody(event));
    const m = await materialsSvc.getMaterial(materialId);
    if (!m) throw new NotFoundError("material");
    middleware.assertTenantAccess(ctx, body.tenant_id);
    if (m.tenant_id !== body.tenant_id) throw new NotFoundError("material");
    const expectedPrefix = `materials/${m.tenant_id}/${m.event_id}/${m.material_id}/`;
    if (!body.s3_key.startsWith(expectedPrefix)) {
      throw new AppError("s3_key must be under the material folder in the private bucket", {
        statusCode: 400,
        code: "BAD_KEY",
      });
    }
    const updated = await materialsSvc.patchMaterial(materialId, {
      s3_key: body.s3_key,
      status: "active",
    });
    return ok({ material: updated });
  } catch (e) {
    return fail(e);
  }
}
