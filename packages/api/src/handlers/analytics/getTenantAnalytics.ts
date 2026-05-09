import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import * as participants from "../../services/participants";
import * as callLogs from "../../services/callLogs";
import { ok, fail } from "../../utils/response";

export async function handleGetTenantAnalytics(
  event: APIGatewayProxyEventV2,
  tenantId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertTenantAccess(ctx, tenantId);
    const evs = await events.listEventsByTenant(tenantId);
    const parts = await participants.listByTenant(tenantId);
    const calls = await callLogs.listByTenant(tenantId);
    const confirmed = parts.filter((p) => p.attendance_status === "confirmed").length;
    const noAnswer = parts.filter((p) => p.attendance_status === "no_answer").length;
    const cancelled = parts.filter((p) => p.attendance_status === "cancelled").length;
    const maybe = parts.filter((p) => p.attendance_status === "maybe").length;
    const needs = parts.filter((p) => p.attendance_status === "needs_human_followup").length;
    const denom = Math.max(1, parts.length);
    return ok({
      total_events: evs.length,
      total_participants: parts.length,
      total_calls: calls.length,
      confirmed,
      no_answer: noAnswer,
      cancelled,
      maybe,
      needs_human_followup: needs,
      show_up_rate_estimated: Math.round((confirmed / denom) * 1000) / 10,
      conversion_improvement_estimated: Math.round(((confirmed - maybe) / denom) * 1000) / 10,
    });
  } catch (e) {
    return fail(e);
  }
}
