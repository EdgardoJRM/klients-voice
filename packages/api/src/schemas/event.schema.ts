import { z } from "zod";

const eventTypeSchema = z.enum([
  "in_person",
  "webinar",
  "hybrid",
  "phone_consultation",
  "custom",
]);
const webinarPlatformSchema = z.enum([
  "zoom",
  "google_meet",
  "teams",
  "custom",
  "none",
]);
const eventStatusSchema = z.enum(["draft", "active", "completed", "cancelled"]);

export const createEventSchema = z
  .object({
    tenant_id: z.string().uuid(),
    event_type: eventTypeSchema,
    title: z.string().min(1).max(500),
    description: z.string().max(8000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expect YYYY-MM-DD"),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    timezone: z.string().min(1).max(80),
    location_name: z.string().max(400).optional(),
    location_address: z.string().max(800).optional(),
    webinar_platform: webinarPlatformSchema.default("none"),
    webinar_url: z.string().url().optional(),
    replay_url: z.string().url().optional(),
    host_name: z.string().max(300).optional(),
    status: eventStatusSchema.default("draft"),
    confirmation_call_enabled: z.boolean().default(true),
    reminder_call_enabled: z.boolean().default(false),
    followup_call_enabled: z.boolean().default(false),
    max_call_retries: z.number().int().min(0).max(20).default(3),
    call_window_start: z.string().optional(),
    call_window_end: z.string().optional(),
    qr_enabled: z.boolean().default(false),
    print_labels_enabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.event_type === "webinar" || v.event_type === "hybrid") {
      if (!v.webinar_url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "webinar_url required for webinar/hybrid events",
          path: ["webinar_url"],
        });
      }
    }
  });

export const listEventsQuerySchema = z
  .object({
    tenant_id: z.string().uuid(),
  })
  .strict();

/** Partial update — never includes tenant_id or event_type */
export const patchEventSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(8000).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expect YYYY-MM-DD").optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    timezone: z.string().min(1).max(80).optional(),
    location_name: z.string().max(400).optional(),
    location_address: z.string().max(800).optional(),
    webinar_platform: webinarPlatformSchema.optional(),
    webinar_url: z.string().url().optional(),
    status: eventStatusSchema.optional(),
    confirmation_call_enabled: z.boolean().optional(),
    reminder_call_enabled: z.boolean().optional(),
    followup_call_enabled: z.boolean().optional(),
    max_call_retries: z.number().int().min(0).max(20).optional(),
    call_window_start: z.string().optional(),
    call_window_end: z.string().optional(),
    qr_enabled: z.boolean().optional(),
    print_labels_enabled: z.boolean().optional(),
    scanner_enabled: z.boolean().optional(),
    materials_enabled: z.boolean().optional(),
    protected_access_rule: z.string().max(200).optional(),
    selected_label_template_id: z.string().uuid().optional(),
  })
  .strict();
