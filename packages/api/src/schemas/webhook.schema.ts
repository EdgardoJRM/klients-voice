import { z } from "zod";

export const clickfunnelsWebhookInnerSchema = z
  .object({
    full_name: z.string().optional(),
    name: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    event_id: z.string().optional(),
    event_title: z.string().optional(),
    workshop_name: z.string().optional(),
    webinar_name: z.string().optional(),
    event_name: z.string().optional(),
    event_type: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    event_date: z.string().optional(),
    event_time: z.string().optional(),
    webinar_url: z.string().optional(),
    consent_voice: z.union([z.boolean(), z.enum(["true", "false"]), z.string()]).optional(),
    consent_email: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
    consent_sms: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
    company_name: z.string().optional(),
    source_funnel: z.string().optional(),
    source_page: z.string().optional(),
  })
  .passthrough();

export const clickfunnelsWebhookSchema = z.union([
  clickfunnelsWebhookInnerSchema,
  z.object({ data: clickfunnelsWebhookInnerSchema.optional() }).passthrough(),
]);

const transcriptTurnSchema = z
  .object({
    role: z.string(),
    message: z.string().optional(),
    time_in_call_secs: z.number().optional(),
  })
  .passthrough();

export const elevenLabsWebhookSchema = z
  .object({
    type: z.string(),
    event_timestamp: z.number().optional(),
    data: z
      .object({
        agent_id: z.string().optional(),
        agent_name: z.string().optional(),
        conversation_id: z.string().optional(),
        metadata: z
          .object({
            call_duration_secs: z.number().optional(),
          })
          .passthrough()
          .optional(),
        transcript: z.array(transcriptTurnSchema).optional(),
        analysis: z
          .object({
            call_successful: z.union([z.string(), z.boolean()]).optional(),
            transcript_summary: z.string().optional(),
          })
          .passthrough()
          .optional(),
        conversation_initiation_client_data: z
          .object({
            dynamic_variables: z.record(z.unknown()).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const elevenLabsCallFailureWebhookSchema = z
  .object({
    type: z.literal("call_initiation_failure"),
    event_timestamp: z.number().optional(),
    data: z
      .object({
        agent_id: z.string().optional(),
        conversation_id: z.string().optional(),
        failure_reason: z.enum(["busy", "no-answer", "unknown"]).optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
