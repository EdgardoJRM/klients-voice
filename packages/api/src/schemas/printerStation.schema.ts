import { z } from "zod";

export const printerStationPairCodeSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    station_name: z.string().min(1).max(200).optional(),
  })
  .strict();

export const printerStationCompletePairingSchema = z
  .object({
    pairing_code: z.string().min(4).max(12).trim(),
    device_name: z.string().max(200).optional(),
    local_app_version: z.string().max(80).optional(),
  })
  .strict();

export const printerStationHeartbeatSchema = z
  .object({
    assigned_printer_name: z.string().max(200).optional(),
    local_app_version: z.string().max(80).optional(),
  })
  .strict();

export const stationTestPrintSchema = z
  .object({
    participant_id: z.string().uuid(),
  })
  .strict();
