import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import { parseSchema } from "../../utils/validation";
import { createEventSchema } from "../../schemas/event.schema";
import * as events from "../../services/events";
import { created, parseJsonBody, fail } from "../../utils/response";

export async function handleCreateEvent(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const body = parseJsonBody(event);
    const input = parseSchema(createEventSchema, body);
    middleware.assertTenantAccess(ctx, input.tenant_id);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin"]);

    const createdEvt = await events.createEvent({
      tenant_id: input.tenant_id,
      event_type: input.event_type,
      title: input.title,
      description: input.description,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      timezone: input.timezone,
      location_name: input.location_name,
      location_address: input.location_address,
      webinar_platform: input.webinar_platform ?? "none",
      webinar_url: input.webinar_url,
      replay_url: input.replay_url,
      host_name: input.host_name,
      status: input.status ?? "draft",
      confirmation_call_enabled: input.confirmation_call_enabled ?? true,
      reminder_call_enabled: input.reminder_call_enabled ?? false,
      followup_call_enabled: input.followup_call_enabled ?? false,
      max_call_retries: input.max_call_retries ?? 3,
      call_window_start: input.call_window_start,
      call_window_end: input.call_window_end,
      call_campaign_status: "not_started",
      qr_enabled: input.qr_enabled ?? false,
      print_labels_enabled: input.print_labels_enabled ?? false,
    });
    return created(createdEvt);
  } catch (e) {
    return fail(e);
  }
}
