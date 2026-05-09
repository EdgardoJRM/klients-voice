import { z } from "zod";

const materialTypeSchema = z.enum(["pdf", "epub", "image_book", "video", "link", "file"]);
const accessRuleSchema = z.enum(["registered", "confirmed", "scanned", "manual"]);
const viewerSchema = z.enum(["secure_pdf", "secure_epub", "image_viewer", "external_link"]);
const statusSchema = z.enum(["active", "archived", "draft"]);

export const createMaterialSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional(),
    material_type: materialTypeSchema,
    access_rule: accessRuleSchema,
    viewer_type: viewerSchema,
    allow_download: z.boolean().default(false),
    watermark_enabled: z.boolean().default(true),
    status: statusSchema.default("draft"),
    external_url: z.string().url().optional(),
    upload_filename: z.string().min(1).max(260).optional(),
  })
  .strict();

export const grantMaterialAccessSchema = z
  .object({
    participant_id: z.string().uuid(),
    access_status: z.enum(["unlocked", "locked", "revoked"]),
  })
  .strict();

export const materialSignedUrlSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    participant_id: z.string().uuid(),
  })
  .strict();

export const attachMaterialAssetSchema = z
  .object({
    tenant_id: z.string().uuid(),
    s3_key: z.string().min(1).max(1024),
  })
  .strict();

export const printJobClaimSchema = z
  .object({
    station_id: z.string().min(1).max(200).optional(),
  })
  .strict();

export const printJobFailSchema = z
  .object({
    error_message: z.string().min(1).max(2000),
  })
  .strict();

export const testPrintSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    participant_id: z.string().uuid(),
    station_id: z.string().max(200).optional(),
  })
  .strict();
