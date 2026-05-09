import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as materials from "../../services/materials";
import * as materialsS3 from "../../services/s3Qr";
import { createMaterialSchema } from "../../schemas/materials.schema";
import { NotFoundError } from "../../utils/errors";
import { created, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handleCreateMaterial(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(createMaterialSchema, parseJsonBody(event));
    const evt = await events.getEvent(body.event_id);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, body.tenant_id);
    if (evt.tenant_id !== body.tenant_id) throw new NotFoundError("event");

    const sanitized = body.upload_filename?.replace(/[^\w.-]+/g, "_") ?? undefined;
    const material = await materials.createMaterial({
      tenant_id: body.tenant_id,
      event_id: body.event_id,
      title: body.title,
      description: body.description,
      material_type: body.material_type,
      s3_key: undefined,
      external_url: body.external_url,
      access_rule: body.access_rule,
      viewer_type: body.viewer_type,
      allow_download: body.allow_download ?? false,
      watermark_enabled: body.watermark_enabled ?? true,
      status: body.status ?? "draft",
    });

    let upload_url: string | undefined;
    let upload_key: string | undefined;
    if (
      sanitized &&
      body.material_type !== "video" &&
      body.material_type !== "link"
    ) {
      const extGuess =
        sanitized.toLowerCase().endsWith(".pdf") ? ".pdf" : sanitized.includes(".") ? "" : "";
      const fn = sanitized.includes(".") ? sanitized : `${sanitized}${body.material_type === "pdf" ? ".pdf" : extGuess}`;
      upload_key = materials.materialsKey(body.tenant_id, body.event_id, material.material_id, fn);
      const contentType =
        body.material_type === "pdf"
          ? "application/pdf"
          : body.material_type === "image_book"
            ? "image/jpeg"
            : "application/octet-stream";
      upload_url = await materialsS3.presignPutObject({
        key: upload_key,
        contentType,
        ttlSeconds: 7200,
      });
    }

    return created({
      material,
      upload_url,
      suggested_s3_key: upload_key,
    });
  } catch (e) {
    return fail(e);
  }
}
