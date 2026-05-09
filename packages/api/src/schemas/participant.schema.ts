import { z } from "zod";

export const participantPatchSchema = z
  .object({
    attendance_status: z
      .enum([
        "pending",
        "confirmed",
        "maybe",
        "cancelled",
        "no_answer",
        "needs_human_followup",
      ])
      .optional(),
    notes: z.string().max(4000).optional(),
    opt_out_voice: z.boolean().optional(),
  })
  .strict();
