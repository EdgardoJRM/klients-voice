import { z } from "zod";

const callTypeSchema = z.enum(["confirmation", "reminder", "followup", "custom"]);
const filterSchema = z.enum([
  "all_pending",
  "no_answer_only",
  "needs_followup_only",
  "selected_participants",
]);

export const startCallsSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    call_type: callTypeSchema,
    filter: filterSchema.default("all_pending"),
    participant_ids: z.array(z.string().uuid()).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.filter === "selected_participants" && !v.participant_ids?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "participant_ids required when filter is selected_participants",
        path: ["participant_ids"],
      });
    }
  });

export const retryCallsSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_id: z.string().uuid(),
    call_type: callTypeSchema,
  })
  .strict();
