"use client";

import { Html5Qrcode } from "html5-qrcode";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type EventDetail = {
  event_id: string;
  tenant_id: string;
  title: string;
  status: string;
  updated_at?: string;
  qr_enabled?: boolean;
  print_labels_enabled?: boolean;
  scanner_enabled?: boolean;
  materials_enabled?: boolean;
  location_name?: string;
  location_address?: string;
  webinar_url?: string;
  protected_access_rule?: string;
  selected_label_template_id?: string;
};

type Participant = {
  participant_id: string;
  full_name?: string;
  email?: string;
  phone?: string;
  attendance_status: string;
  call_status: string;
  registration_status?: string;
  checked_in?: boolean;
  checked_in_at?: string;
  checked_in_by?: string;
  access_status?: string;
  last_call_at?: string;
};

type Analytics = {
  registrados: number;
  confirmados: number;
  escaneados?: number;
  llamadas_realizadas: number;
  contestaron?: number;
  cancelados: number;
  no_contestaron: number;
  necesitan_seguimiento: number;
  materiales_activos?: number;
  etiquetas_en_cola?: number;
  pending_checkin?: number;
  print_jobs_printed?: number;
  print_jobs_failed?: number;
  print_labels_enabled?: boolean;
  qr_enabled?: boolean;
  scanner_enabled?: boolean;
  materials_enabled?: boolean;
  station_online_recent?: boolean;
  porcentaje_confirmado?: number;
  porcentaje_no_contesto?: number;
};

type MaterialRow = {
  material_id: string;
  title: string;
  material_type: string;
  status: string;
  viewer_type?: string;
};

type PrintJobRow = {
  print_job_id: string;
  participant_id: string;
  status: string;
  created_at: string;
};

type ScanState =
  | { kind: "idle" }
  | { kind: "success"; participant: Participant; warning?: string | null; scanned_at?: string | null }
  | { kind: "error"; message: string; code?: string };

function extractQrToken(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { qr_token?: string };
    if (typeof o?.qr_token === "string" && o.qr_token.length > 0) return o.qr_token;
  } catch {
    /* plain token */
  }
  return raw;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [tab, setTab] = useState<"participants" | "scanner" | "materials" | "print" | "settings">(
    "participants",
  );
  const [metrics, setMetrics] = useState<Analytics | null>(null);
  const [plist, setPlist] = useState<Participant[]>([]);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [pairResult, setPairResult] = useState<{
    pairing_code: string;
    station_id: string;
    expires_in_seconds: number;
  } | null>(null);
  const [stationPairNameDraft, setStationPairNameDraft] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });
  const [camActive, setCamActive] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [materialsList, setMaterialsList] = useState<MaterialRow[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJobRow[]>([]);
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
  const [viewerParticipantId, setViewerParticipantId] = useState("");
  const [testParticipantId, setTestParticipantId] = useState("");
  const [printStationId, setPrintStationId] = useState("");
  const html5Ref = useRef<Html5Qrcode | null>(null);
  const validatingRef = useRef(false);
  const throttleRef = useRef<{ token: string; at: number } | null>(null);

  function minCameraBox(px: number) {
    if (typeof window === "undefined") return px;
    return Math.min(px, Math.floor(window.innerWidth * 0.85));
  }

  useEffect(() => {
    setOperatorEmail(localStorage.getItem("kv_operator_email") ?? "");
  }, []);

  const reloadDataSilent = useCallback(async () => {
    const token = localStorage.getItem("kv_token");
    if (!token) return;
    const [r1, r2] = await Promise.all([
      apiFetch(`/events/${encodeURIComponent(id)}/analytics`, { method: "GET", token }),
      apiFetch(`/events/${encodeURIComponent(id)}/participants`, { method: "GET", token }),
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    if (r1.ok && j1.success) setMetrics(j1.data as Analytics);
    if (r2.ok && j2.success) setPlist(j2.data as Participant[]);
  }, [id]);

  const loadInitialData = useCallback(async () => {
    const token = localStorage.getItem("kv_token");
    if (!token) throw new Error("Falta kv_token");
    const [r1, r2, r3] = await Promise.all([
      apiFetch(`/events/${encodeURIComponent(id)}/analytics`, { method: "GET", token }),
      apiFetch(`/events/${encodeURIComponent(id)}/participants`, { method: "GET", token }),
      apiFetch(`/events/${encodeURIComponent(id)}`, { method: "GET", token }),
    ]);
    const j1 = await r1.json();
    const j2 = await r2.json();
    const j3 = await r3.json();
    if (!r1.ok || !j1.success) throw new Error((j1.error as { message?: string })?.message ?? "analytics");
    if (!r2.ok || !j2.success) throw new Error((j2.error as { message?: string })?.message ?? "participants");
    if (!r3.ok || !j3.success)
      throw new Error((j3.error as { message?: string })?.message ?? "event");
    setMetrics(j1.data as Analytics);
    setPlist(j2.data as Participant[]);
    setEventDetail(j3.data as EventDetail);
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        await loadInitialData();
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [loadInitialData]);

  const refreshMaterials = useCallback(async () => {
    const token = localStorage.getItem("kv_token");
    if (!token) return;
    const r = await apiFetch(`/events/${encodeURIComponent(id)}/materials`, {
      method: "GET",
      token,
    });
    const j = (await r.json()) as { success?: boolean; data?: MaterialRow[] };
    if (r.ok && j.success && j.data) setMaterialsList(j.data);
  }, [id]);

  const refreshPrintJobs = useCallback(async () => {
    const token = localStorage.getItem("kv_token");
    if (!token) return;
    const r = await apiFetch(`/print-jobs?event_id=${encodeURIComponent(id)}`, {
      method: "GET",
      token,
    });
    const j = (await r.json()) as { success?: boolean; data?: PrintJobRow[] };
    if (r.ok && j.success && Array.isArray(j.data)) setPrintJobs(j.data);
  }, [id]);

  useEffect(() => {
    const first = plist[0]?.participant_id;
    if (!first) return;
    setViewerParticipantId((prev) => prev || first);
    setTestParticipantId((prev) => prev || first);
  }, [plist]);

  useEffect(() => {
    if (tab !== "materials") return;
    void refreshMaterials();
  }, [tab, refreshMaterials]);

  useEffect(() => {
    if (tab !== "print") return;
    void refreshPrintJobs();
    const timer = window.setInterval(() => void refreshPrintJobs(), 7000);
    return () => window.clearInterval(timer);
  }, [tab, refreshPrintJobs]);

  const tenantId = process.env.NEXT_PUBLIC_KV_TENANT_ID ?? "";

  const patchEventPartial = useCallback(
    async (patch: Record<string, unknown>) => {
      const token = localStorage.getItem("kv_token");
      if (!token) {
        alert("Falta kv_token");
        return;
      }
      setSettingsBusy(true);
      try {
        const res = await apiFetch(`/events/${encodeURIComponent(id)}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(patch),
        });
        const j = (await res.json()) as {
          success?: boolean;
          data?: EventDetail;
          error?: { message?: string };
        };
        if (!res.ok || !j.success || !j.data) {
          alert(j.error?.message ?? "No se guardó la configuración");
          return;
        }
        setEventDetail(j.data);
        await reloadDataSilent();
      } finally {
        setSettingsBusy(false);
      }
    },
    [id, reloadDataSilent],
  );

  async function generateStationPairCode() {
    const token = localStorage.getItem("kv_token");
    if (!token || !tenantId) {
      alert("Falta token o NEXT_PUBLIC_KV_TENANT_ID");
      return;
    }
    setSettingsBusy(true);
    try {
      const res = await apiFetch("/printer-stations/pair-code", {
        method: "POST",
        token,
        body: JSON.stringify({
          tenant_id: tenantId,
          event_id: id,
          station_name: stationPairNameDraft.trim() || undefined,
        }),
      });
      const j = (await res.json()) as {
        success?: boolean;
        data?: { pairing_code: string; station_id: string; expires_in_seconds: number };
        error?: { message?: string };
      };
      if (!res.ok || !j.success || !j.data) {
        alert(j.error?.message ?? "No se generó código");
        setPairResult(null);
        return;
      }
      setPairResult({
        pairing_code: j.data.pairing_code,
        station_id: j.data.station_id,
        expires_in_seconds: j.data.expires_in_seconds,
      });
    } finally {
      setSettingsBusy(false);
    }
  }

  async function reprintParticipantLabel(participantId: string) {
    const token = localStorage.getItem("kv_token");
    if (!token || !tenantId) {
      alert("Falta token o tenant");
      return;
    }
    const body: Record<string, string | undefined> = {
      tenant_id: tenantId,
      event_id: id,
      participant_id: participantId,
    };
    const sid = printStationId.trim();
    if (sid) body.station_id = sid;
    const res = await apiFetch("/print-jobs/test-print", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !j.success) {
      alert(j.error?.message ?? "Reimpresión falló");
      return;
    }
    alert("Etiqueta reencolada (test-print)");
    void reloadDataSilent();
  }

  const resetScanFeedback = useCallback(() => {
    throttleRef.current = null;
    setScanState({ kind: "idle" });
  }, []);

  const validateToken = useCallback(
    async (qr_token: string) => {
      const token = localStorage.getItem("kv_token");
      if (!token || !tenantId) {
        setScanState({ kind: "error", message: "Falta kv_token o NEXT_PUBLIC_KV_TENANT_ID" });
        return;
      }
      if (validatingRef.current) return;
      const prev = throttleRef.current;
      const now = Date.now();
      if (prev?.token === qr_token && now - prev.at < 1800) return;
      throttleRef.current = { token: qr_token, at: now };
      validatingRef.current = true;
      try {
        const scanned_by =
          operatorEmail.trim() || localStorage.getItem("kv_operator_email")?.trim() || "dashboard";
        const res = await apiFetch("/scanner/validate", {
          method: "POST",
          token,
          body: JSON.stringify({
            tenant_id: tenantId,
            event_id: id,
            qr_token,
            scanned_by,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { participant?: Participant; warning?: string | null; scanned_at?: string | null };
          error?: { code?: string; message?: string };
        };
        if (!res.ok || !json.success) {
          setScanState({
            kind: "error",
            message: json.error?.message ?? "Validación fallida",
            code: json.error?.code,
          });
          return;
        }
        const p = json.data?.participant;
        if (!p) {
          setScanState({ kind: "error", message: "Respuesta sin participante" });
          return;
        }
        setScanState({
          kind: "success",
          participant: p,
          warning: json.data?.warning ?? null,
          scanned_at: json.data?.scanned_at ?? null,
        });
        void reloadDataSilent();
      } catch (e) {
        setScanState({ kind: "error", message: e instanceof Error ? e.message : "Error de red" });
      } finally {
        validatingRef.current = false;
      }
    },
    [id, reloadDataSilent, tenantId, operatorEmail],
  );

  const stopCamera = useCallback(async () => {
    const h = html5Ref.current;
    if (h) {
      try {
        if ((h as unknown as { isScanning?: boolean }).isScanning) {
          await h.stop();
          await h.clear();
        }
      } catch {
        /* noop */
      }
    }
    html5Ref.current = null;
    setCamActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    const elId = "scanner-camera-region";
    try {
      await stopCamera();
      const h = new Html5Qrcode(elId);
      html5Ref.current = h;
      const qb = minCameraBox(260);
      await h.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: qb, height: qb } },
        (decodedText) => {
          const tok = extractQrToken(decodedText);
          if (tok) void validateToken(tok);
        },
        () => {},
      );
      setCamActive(true);
    } catch (e) {
      setScanState({
        kind: "error",
        message: e instanceof Error ? e.message : "No se pudo iniciar la cámara",
        code: "CAMERA",
      });
    }
  }, [stopCamera, validateToken]);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  async function startCalls() {
    const token = localStorage.getItem("kv_token");
    await apiFetch("/calls/start", {
      method: "POST",
      token: token ?? "",
      body: JSON.stringify({
        tenant_id: tenantId,
        event_id: id,
        call_type: "confirmation",
        filter: "all_pending",
      }),
    });
    alert("Solicitud enviada: /calls/start");
  }

  async function retryCalls() {
    const token = localStorage.getItem("kv_token");
    await apiFetch("/calls/retry", {
      method: "POST",
      token: token ?? "",
      body: JSON.stringify({
        tenant_id: tenantId,
        event_id: id,
        call_type: "confirmation",
      }),
    });
    alert("Solicitud enviada: /calls/retry");
  }

  async function resendQr(participantId: string) {
    const token = localStorage.getItem("kv_token");
    if (!token) return;
    const res = await apiFetch(`/events/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/resend-qr`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      alert(j.error?.message ?? "Error al reenviar QR");
      return;
    }
    alert("QR reenviado por email");
  }

  async function setMaterialAccess(participantId: string, unlocked: boolean) {
    const token = localStorage.getItem("kv_token");
    if (!token) return;
    const res = await apiFetch(
      `/events/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/material-access`,
      { method: "POST", token, body: JSON.stringify({ unlocked }) },
    );
    const j = await res.json();
    if (!res.ok || !j.success) {
      alert(j.error?.message ?? "Error actualizando acceso");
      return;
    }
    const p = j.data?.participant as Participant | undefined;
    if (p && scanState.kind === "success" && scanState.participant.participant_id === participantId) {
      setScanState({ ...scanState, participant: p });
    }
    void reloadDataSilent();
  }

  async function createMaterial() {
    const token = localStorage.getItem("kv_token");
    if (!token || !tenantId) {
      alert("Falta token o tenant");
      return;
    }
    const title = newMaterialTitle.trim() || "Nuevo PDF";
    const res = await apiFetch("/materials", {
      method: "POST",
      token,
      body: JSON.stringify({
        tenant_id: tenantId,
        event_id: id,
        title,
        material_type: "pdf",
        access_rule: "scanned",
        viewer_type: "secure_pdf",
        allow_download: false,
        watermark_enabled: true,
        status: "draft",
        upload_filename: `${title.replace(/\s+/g, "_")}.pdf`,
      }),
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      alert(j.error?.message ?? "No se creó el material");
      return;
    }
    if (j.data && typeof j.data === "object" && "upload_url" in j.data && j.data.upload_url) {
      console.info("Material upload_url (PUT archivo):", j.data.upload_url);
    }
    setNewMaterialTitle("");
    void refreshMaterials();
    alert("Material creado. Revisa la consola si hay upload_url; luego PATCH /materials/:id/asset o sube a S3.");
  }

  async function enqueueTestPrint() {
    const token = localStorage.getItem("kv_token");
    if (!token || !tenantId) {
      alert("Falta token o tenant");
      return;
    }
    const participant_id = testParticipantId.trim();
    if (!participant_id) {
      alert("Elige participant_id para la prueba");
      return;
    }
    const body: Record<string, string | undefined> = {
      tenant_id: tenantId,
      event_id: id,
      participant_id,
    };
    const sid = printStationId.trim();
    if (sid) body.station_id = sid;
    const res = await apiFetch("/print-jobs/test-print", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      alert(j.error?.message ?? "test-print falló");
      return;
    }
    void refreshPrintJobs();
    alert("Cola test-print lista (revisa etiquetas encoladas).");
  }

  const badgeColor =
    scanState.kind === "success"
      ? scanState.warning === "already_checked_in"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-emerald-300 bg-emerald-50 text-emerald-950"
      : scanState.kind === "error"
        ? "border-red-300 bg-red-50 text-red-950"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <Link href="/dashboard" className="text-sm text-slate-600 underline">
        ← Eventos
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Detalle del evento</h1>
      {err && <p className="mt-6 text-sm text-red-600">{err}</p>}

      <div className="mt-8 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:flex sm:flex-wrap">
        <button
          type="button"
          className={`flex-1 min-w-[120px] rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            tab === "participants" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("participants")}
        >
          Participantes
        </button>
        <button
          type="button"
          className={`flex-1 min-w-[120px] rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            tab === "scanner" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("scanner")}
        >
          Scanner
        </button>
        <button
          type="button"
          className={`flex-1 min-w-[120px] rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            tab === "materials" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("materials")}
        >
          Materiales
        </button>
        <button
          type="button"
          className={`flex-1 min-w-[120px] rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            tab === "print" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("print")}
        >
          Impresión
        </button>
        <button
          type="button"
          className={`flex-1 min-w-[120px] rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            tab === "settings" ? "bg-white shadow-sm text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
          onClick={() => setTab("settings")}
        >
          Configuración
        </button>
      </div>

      {tab === "participants" && metrics && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Registrados", metrics.registrados],
            ["Escaneados", metrics.escaneados ?? 0],
            ["Llamadas", metrics.llamadas_realizadas],
            ["Confirmados", metrics.confirmados],
            ["Contestaron (>0s)", metrics.contestaron ?? 0],
            ["No contestaron", metrics.no_contestaron],
            ["Cancelados", metrics.cancelados],
            ["Seguimiento", metrics.necesitan_seguimiento],
            ["Materiales activos", metrics.materiales_activos ?? 0],
            ["Etiquetas en cola", metrics.etiquetas_en_cola ?? 0],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">{String(k)}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{String(v)}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "scanner" && metrics && (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                metrics.print_labels_enabled === true
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              Impresión {metrics.print_labels_enabled === true ? "activada" : "desactivada"}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                metrics.station_online_recent
                  ? "bg-sky-100 text-sky-900"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Puente {metrics.station_online_recent ? "en línea reciente" : "sin latido"}
            </span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Registrados", metrics.registrados],
              ["Escaneados", metrics.escaneados ?? 0],
              ["Pendientes check-in", metrics.pending_checkin ?? 0],
              ["Confirmados", metrics.confirmados],
              ["Etiquetas en cola", metrics.etiquetas_en_cola ?? 0],
              ["Etiquetas impresas", metrics.print_jobs_printed ?? 0],
              ["Etiquetas fallidas", metrics.print_jobs_failed ?? 0],
              ["% Confirmado", metrics.porcentaje_confirmado ?? 0],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">{String(k)}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{String(v)}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {tab === "participants" && (
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
          onClick={() => void startCalls()}
        >
          Iniciar confirmaciones
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-900"
          onClick={() => void retryCalls()}
        >
          Reintentar no contestados
        </button>
      </div>
      )}

      {tab === "scanner" && (
        <div className="mt-12 space-y-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Email del operador (escaneado por)
            </label>
            <input
              className="mt-2 w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-slate-900 focus:ring-2"
              placeholder="nombre@ejemplo.com"
              value={operatorEmail}
              onChange={(e) => {
                setOperatorEmail(e.target.value);
                if (typeof window !== "undefined") {
                  localStorage.setItem("kv_operator_email", e.target.value.trim());
                }
              }}
            />
            <p className="mt-2 text-xs text-slate-500">Se guarda en localStorage como kv_operator_email.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {!camActive ? (
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
                  onClick={() => void startCamera()}
                >
                  Activar cámara
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-900"
                  onClick={() => void stopCamera()}
                >
                  Detener cámara
                </button>
              )}
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-900"
                onClick={resetScanFeedback}
              >
                Limpiar resultado
              </button>
            </div>
            <div
              id="scanner-camera-region"
              className="mt-6 min-h-[280px] w-full max-w-xl overflow-hidden rounded-2xl bg-slate-900/5"
            />
          </div>

          <div className={`rounded-2xl border p-6 shadow-sm ${badgeColor}`}>
            {scanState.kind === "idle" && (
              <p className="text-sm">Escanea un código QR. El servidor validará el token en Dynamo.</p>
            )}
            {scanState.kind === "error" && (
              <div>
                <p className="font-semibold">Inválido o error</p>
                <p className="mt-2 text-sm opacity-90">
                  {scanState.message}
                  {scanState.code ? ` (${scanState.code})` : ""}
                </p>
              </div>
            )}
            {scanState.kind === "success" && (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold">
                    {scanState.warning === "already_checked_in" ? "Ya escaneado" : "Acceso válido"}
                  </p>
                  {scanState.warning === "already_checked_in" ? (
                    <p className="mt-2 text-sm">Este participante ya hizo check-in anteriormente.</p>
                  ) : (
                    scanState.scanned_at && (
                      <p className="mt-2 text-sm">Check-in: {scanState.scanned_at}</p>
                    )
                  )}
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase opacity-70">Nombre</dt>
                    <dd className="font-medium">{scanState.participant.full_name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase opacity-70">Email</dt>
                    <dd className="font-medium">{scanState.participant.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase opacity-70">Teléfono</dt>
                    <dd className="font-medium">{scanState.participant.phone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase opacity-70">Estado registro</dt>
                    <dd className="font-medium">{scanState.participant.registration_status ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase opacity-70">Checked in</dt>
                    <dd className="font-medium">{String(scanState.participant.checked_in ?? false)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase opacity-70">Materiales</dt>
                    <dd className="font-medium">{scanState.participant.access_status ?? "—"}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white"
                    onClick={() => void reprintParticipantLabel(scanState.participant.participant_id)}
                  >
                    Reprint etiqueta
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-900/15 bg-white/80 px-4 py-2 text-sm font-medium"
                    disabled={!scanState.participant.email}
                    onClick={() => void resendQr(scanState.participant.participant_id)}
                  >
                    Reenviar QR por email
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    onClick={() =>
                      void setMaterialAccess(scanState.participant.participant_id, true)
                    }
                  >
                    Desbloquear materiales
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
                    onClick={() =>
                      void setMaterialAccess(scanState.participant.participant_id, false)
                    }
                  >
                    Bloquear materiales
                  </button>
                  <p className="pt-1 text-xs text-slate-600 max-w-xl">
                    Con <code className="rounded bg-slate-100 px-1">print_labels_enabled</code> en el evento,
                    el primer check-in encola una etiqueta para el Print Bridge (Electron).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "materials" && (
        <div className="mt-12 space-y-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Alta rápida de material (PDF)</h2>
            <p className="mt-2 text-sm text-slate-600">
              Draft + URL de subida. Completa el archivo con PUT a la <code>upload_url</code> (network tab).
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <input
                className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Título del PDF"
                value={newMaterialTitle}
                onChange={(e) => setNewMaterialTitle(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
                onClick={() => void createMaterial()}
              >
                Crear borrador
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-900"
                onClick={() => void refreshMaterials()}
              >
                Refrescar lista
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Secure viewer (staff)</h2>
            <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Participante para firmar URL
            </label>
            <select
              className="mt-2 w-full max-w-lg rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={viewerParticipantId}
              onChange={(e) => setViewerParticipantId(e.target.value)}
            >
              <option value="">—</option>
              {plist.map((p) => (
                <option key={p.participant_id} value={p.participant_id}>
                  {p.full_name ?? p.email ?? p.participant_id}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Viewer</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {materialsList.map((m) => (
                  <tr key={m.material_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium">{m.title}</td>
                    <td className="px-4 py-3">{m.material_type}</td>
                    <td className="px-4 py-3">{m.status}</td>
                    <td className="px-4 py-3">{m.viewer_type ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {viewerParticipantId ? (
                        <Link
                          className="text-sm text-slate-900 underline"
                          href={`/dashboard/events/${encodeURIComponent(id)}/viewer/${encodeURIComponent(m.material_id)}?participant_id=${encodeURIComponent(viewerParticipantId)}`}
                        >
                          Abrir viewer
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">elige participante</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "print" && (
        <div className="mt-12 space-y-8">
          {metrics && (
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  metrics.print_labels_enabled === true
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                Impresión al escanear: {metrics.print_labels_enabled === true ? "activada" : "desactivada"}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Impresas: {metrics.print_jobs_printed ?? 0} · Fallidas: {metrics.print_jobs_failed ?? 0}
              </span>
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Cola de etiquetas (queued)</h2>
            <p className="mt-2 text-sm text-slate-600">
              El Print Bridge hace claim → <code>lp</code> → complete. Refresco cada 7s.
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900"
              onClick={() => void refreshPrintJobs()}
            >
              Refrescar ahora
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Prueba manual</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <select
                className="min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={testParticipantId}
                onChange={(e) => setTestParticipantId(e.target.value)}
              >
                {plist.map((p) => (
                  <option key={p.participant_id} value={p.participant_id}>
                    {p.full_name ?? p.email ?? p.participant_id}
                  </option>
                ))}
              </select>
              <input
                className="min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="station_id (opcional)"
                value={printStationId}
                onChange={(e) => setPrintStationId(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                onClick={() => void enqueueTestPrint()}
              >
                test-print
              </button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Participante</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Creado</th>
                </tr>
              </thead>
              <tbody>
                {printJobs.map((j) => (
                  <tr key={j.print_job_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs">{j.print_job_id}</td>
                    <td className="px-4 py-3 font-mono text-xs">{j.participant_id}</td>
                    <td className="px-4 py-3">{j.status}</td>
                    <td className="px-4 py-3 text-xs">{j.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {printJobs.length === 0 && (
              <p className="p-6 text-sm text-slate-500">Sin trabajos encolados para este evento.</p>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && eventDetail && (
        <div className="mt-12 space-y-8">
          {settingsBusy ? (
            <p className="text-sm font-medium text-slate-600">Guardando configuración…</p>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">Estado del evento</h2>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </label>
            <select
              className="mt-1 w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={eventDetail.status}
              onChange={(e) => void patchEventPartial({ status: e.target.value })}
            >
              {(["draft", "active", "completed", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">Comportamiento</h2>
            <div className="space-y-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={eventDetail.print_labels_enabled === true}
                  onChange={(e) =>
                    void patchEventPartial({ print_labels_enabled: e.target.checked })
                  }
                />
                Imprimir etiqueta al escanear
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={eventDetail.qr_enabled === true}
                  onChange={(e) => void patchEventPartial({ qr_enabled: e.target.checked })}
                />
                QR habilitado (envío / tickets)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={eventDetail.scanner_enabled !== false}
                  onChange={(e) => void patchEventPartial({ scanner_enabled: e.target.checked })}
                />
                Scanner / check-in desde dashboard activo
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={eventDetail.materials_enabled !== false}
                  onChange={(e) =>
                    void patchEventPartial({ materials_enabled: e.target.checked })
                  }
                />
                Materiales visibles para staff
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">Ubicación y webinar</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nombre del lugar
                </label>
                <input
                  key={`ln-${eventDetail.updated_at ?? "x"}`}
                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  defaultValue={eventDetail.location_name ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (eventDetail.location_name ?? "")) return;
                    void patchEventPartial({ location_name: v });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dirección
                </label>
                <textarea
                  key={`la-${eventDetail.updated_at ?? "x"}`}
                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  defaultValue={eventDetail.location_address ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (eventDetail.location_address ?? "")) return;
                    void patchEventPartial({ location_address: v });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  URL webinar
                </label>
                <input
                  key={`wu-${eventDetail.updated_at ?? "x"}`}
                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="https://…"
                  defaultValue={eventDetail.webinar_url ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (eventDetail.webinar_url ?? "")) return;
                    void patchEventPartial({ webinar_url: v || undefined });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Regla de acceso (texto MVP)
                </label>
                <input
                  key={`pa-${eventDetail.updated_at ?? "x"}`}
                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  defaultValue={eventDetail.protected_access_rule ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (eventDetail.protected_access_rule ?? "")) return;
                    void patchEventPartial({ protected_access_rule: v });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Plantilla de etiqueta (UUID, opcional)
                </label>
                <input
                  key={`sl-${eventDetail.updated_at ?? "x"}`}
                  className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  defaultValue={eventDetail.selected_label_template_id ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (eventDetail.selected_label_template_id ?? "")) return;
                    if (!v) return;
                    if (!UUID_RE.test(v)) {
                      alert("selected_label_template_id debe ser UUID");
                      return;
                    }
                    void patchEventPartial({ selected_label_template_id: v });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">Emparejar Print Bridge</h2>
            <p className="text-sm text-slate-600">
              Genera un código de 6 dígitos (válido ~10 min). En el equipo con la impresora, abre Print
              Bridge, pega la API pública y el código, y completa el emparejamiento.
            </p>
            <input
              className="w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm"
              placeholder="Nombre de la estación (opcional)"
              value={stationPairNameDraft}
              onChange={(e) => setStationPairNameDraft(e.target.value)}
            />
            <div>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={settingsBusy}
                onClick={() => void generateStationPairCode()}
              >
                Generar código de emparejamiento
              </button>
            </div>
            {pairResult ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Código: {pairResult.pairing_code}</p>
                <p className="mt-1 font-mono text-xs">station_id: {pairResult.station_id}</p>
                <p className="mt-1 text-xs">Expira en {pairResult.expires_in_seconds}s</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === "settings" && !eventDetail && !err && (
        <p className="mt-12 text-sm text-slate-500">Cargando configuración del evento…</p>
      )}

      {tab === "participants" && (
        <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Asistencia</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Llamada</th>
              </tr>
            </thead>
            <tbody>
              {plist.map((p) => (
                <tr key={p.participant_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">{p.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{p.email ?? "—"}</td>
                  <td className="px-4 py-3">{p.phone ?? "—"}</td>
                  <td className="px-4 py-3">{p.attendance_status}</td>
                  <td className="px-4 py-3">{p.checked_in === true ? "Sí" : "No"}</td>
                  <td className="px-4 py-3">{p.call_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
