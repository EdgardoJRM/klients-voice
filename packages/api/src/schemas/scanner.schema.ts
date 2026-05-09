import { z } from "zod";

export const scannerValidateSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    qr_token: z.string().min(1),
    scanned_by: z.string().min(1).max(500),
    station_id: z.string().max(200).optional(),
  })
  .strict();

export type ScannerValidateBody = z.infer<typeof scannerValidateSchema>;

export const materialAccessBodySchema = z
  .object({
    unlocked: z.boolean(),
  })
  .strict();
