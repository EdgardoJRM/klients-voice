import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import { readEnv } from "../../config/env";
import * as participants from "../../services/participants";
import * as callLogs from "../../services/callLogs";
import * as materials from "../../services/materials";
import * as printJobs from "../../services/printJobs";
import * as stations from "../../services/printerStations";
import { NotFoundError } from "../../utils/errors";
import { ok, fail } from "../../utils/response";

const STALE_MS = 120_000;

export async function handleGetEventAnalytics(
  event: APIGatewayProxyEventV2,
  eventId: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    const evt = await events.getEvent(eventId);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, evt.tenant_id);
    const plist = await participants.listByEvent(eventId);
    const logs = await Promise.all(plist.map((p) => callLogs.listByParticipant(p.participant_id)));
    const flat = logs.flat();
    const metrics = {
      total_participants: plist.length,
      registrados: plist.filter(
        (p) => p.registration_status === "registered" || p.registration_status === "attended",
      ).length,
      llamadas_realizadas: flat.length,
      contestaron: flat.filter((c) => (c.duration_seconds ?? 0) > 0).length,
      confirmados: plist.filter((p) => p.attendance_status === "confirmed").length,
      escaneados: plist.filter((p) => p.checked_in === true).length,
      checked_in: plist.filter((p) => p.checked_in === true).length,
      pending_checkin: plist.filter(
        (p) => p.checked_in !== true && p.attendance_status !== "cancelled",
      ).length,
      cancelados: plist.filter((p) => p.attendance_status === "cancelled").length,
      no_answer: plist.filter((p) => p.attendance_status === "no_answer").length,
      no_contestaron: plist.filter((p) => p.attendance_status === "no_answer").length,
      necesitan_seguimiento: plist.filter((p) => p.attendance_status === "needs_human_followup")
        .length,
    };
    const denom = Math.max(1, metrics.registrados);
    const cfg = readEnv();
    let materiales_activos = 0;
    let etiquetas_en_cola = 0;
    let print_jobs_printed = 0;
    let print_jobs_failed = 0;
    let recent_print_jobs: Awaited<ReturnType<typeof printJobs.getRecentPrintJobsForEvent>> = [];
    let printer_stations: Awaited<ReturnType<typeof stations.listStationsForEvent>> = [];
    let station_online_recent = false;

    try {
      if (cfg.tableMaterials) {
        const mats = await materials.listMaterialsByEvent(eventId);
        materiales_activos = mats.filter((m) => m.status === "active").length;
      }
      if (cfg.tablePrintJobs) {
        etiquetas_en_cola = (await printJobs.listQueuedJobsForEvent(eventId)).length;
        print_jobs_printed = (await printJobs.listJobsByEvtQueuePrefix(eventId, "PRINTED#")).length;
        print_jobs_failed = (await printJobs.listJobsByEvtQueuePrefix(eventId, "FAILED#")).length;
        recent_print_jobs = await printJobs.getRecentPrintJobsForEvent(eventId, 20);
      }
      if (cfg.tablePrinterStations) {
        printer_stations = await stations.listStationsForEvent(evt.tenant_id, eventId);
        const now = Date.now();
        station_online_recent = printer_stations.some((s) => {
          if (!s.last_seen_at || s.status !== "online") return false;
          return now - new Date(s.last_seen_at).getTime() < STALE_MS;
        });
      }
    } catch (e) {
      console.warn(
        JSON.stringify({
          msg: "analytics_extended_metrics_failed",
          event_id: eventId,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    return ok({
      ...metrics,
      materials_active: materiales_activos,
      materiales_activos,
      etiquetas_en_cola,
      print_jobs_queued: etiquetas_en_cola,
      print_jobs_printed,
      print_jobs_failed,
      last_print_job: recent_print_jobs[0] ?? null,
      recent_print_jobs,
      printer_stations,
      station_online_recent,
      print_labels_enabled: evt.print_labels_enabled === true,
      qr_enabled: evt.qr_enabled === true,
      scanner_enabled: evt.scanner_enabled !== false,
      materials_enabled: evt.materials_enabled !== false,
      porcentaje_confirmado: Math.round((metrics.confirmados / denom) * 1000) / 10,
      porcentaje_no_contesto: Math.round((metrics.no_contestaron / denom) * 1000) / 10,
    });
  } catch (e) {
    return fail(e);
  }
}
