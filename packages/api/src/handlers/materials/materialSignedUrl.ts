import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as participants from "../../services/participants";
import * as materialsSvc from "../../services/materials";
import * as materialAccessSvc from "../../services/materialAccess";
import * as materialsS3 from "../../services/s3Qr";
import { participantCanAccessMaterial } from "../../services/materialAccessRules";
import { materialSignedUrlSchema } from "../../schemas/materials.schema";
import { AppError, NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleMaterialSignedUrl(
  event: APIGatewayProxyEventV2,
  materialId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(materialSignedUrlSchema, parseJsonBody(event));
    const m = await materialsSvc.getMaterial(materialId);
    if (!m) throw new NotFoundError("material");
    if (m.tenant_id !== body.tenant_id || m.event_id !== body.event_id) {
      throw new AppError("Material scope mismatch", { statusCode: 400, code: "SCOPE_MISMATCH" });
    }
    const p = await participants.getParticipant(body.participant_id);
    if (!p) throw new NotFoundError("participant");
    middleware.assertTenantAccess(ctx, m.tenant_id);
    const accessRow = await materialAccessSvc.findAccess(body.participant_id, materialId);
    if (!participantCanAccessMaterial({ material: m, participant: p, accessRow })) {
      throw new AppError("Access denied for this material", { statusCode: 403, code: "MATERIAL_DENIED" });
    }
    const key = m.s3_key;
    if (!key) throw new AppError("Material asset not uploaded", { statusCode: 409, code: "NO_ASSET" });
    const contentType =
      m.material_type === "pdf"
        ? "application/pdf"
        : m.material_type === "epub"
          ? "application/epub+zip"
          : undefined;
    const url = await materialsS3.presignGetObject({
      key,
      ttlSeconds: 900,
      responseContentType: contentType,
    });
    if (accessRow?.access_id) {
      await materialAccessSvc.touchLastAccess(accessRow.access_id);
    }
    return ok({
      url,
      ttl_seconds: 900,
      allow_download: m.allow_download,
      viewer_type: m.viewer_type,
      watermark_enabled: m.watermark_enabled,
      title: m.title,
      external_url: m.external_url,
    });
  } catch (e) {
    return fail(e);
  }
}
