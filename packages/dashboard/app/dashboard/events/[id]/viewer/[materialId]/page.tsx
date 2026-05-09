"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type SignedPayload = {
  url?: string;
  viewer_type?: string;
  title?: string;
  external_url?: string;
  allow_download?: boolean;
};

export default function MaterialViewerPage() {
  const params = useParams<{ id: string; materialId: string }>();
  const search = useSearchParams();
  const eventId = params?.id ?? "";
  const materialId = params?.materialId ?? "";
  const participantId = search.get("participant_id") ?? "";
  const tenantId = process.env.NEXT_PUBLIC_KV_TENANT_ID ?? "";

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<SignedPayload | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("kv_token");
      if (!token || !tenantId || !participantId || !eventId || !materialId) {
        setErr("Falta token, tenant, participant_id (query), evento o material.");
        setLoading(false);
        return;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(null);
      setLoading(true);
      setErr(null);
      try {
        const res = await apiFetch(`/materials/${encodeURIComponent(materialId)}/signed-url`, {
          method: "POST",
          token,
          body: JSON.stringify({
            tenant_id: tenantId,
            event_id: eventId,
            participant_id: participantId,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: SignedPayload;
          error?: { message?: string };
        };
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? "No se pudo obtener URL firmada");
        }
        const data = json.data ?? {};
        setMeta(data);
        if (data.viewer_type === "external_link" && data.external_url) {
          setLoading(false);
          window.location.replace(data.external_url);
          return;
        }
        const u = data.url;
        if (!u) throw new Error("Sin URL para visualizar");
        const pdfRes = await fetch(u);
        if (!pdfRes.ok) throw new Error("Fallo al descargar el recurso para el viewer");
        const blob = await pdfRes.blob();
        const ou = URL.createObjectURL(blob);
        objectUrlRef.current = ou;
        setBlobUrl(ou);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        setBlobUrl(null);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [eventId, materialId, participantId, tenantId]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/dashboard/events/${encodeURIComponent(eventId)}`} className="text-sm text-slate-600 underline">
        ← Volver al evento
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">{meta?.title ?? "Material"}</h1>
      {!participantId && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Añade `?participant_id=` en la URL (UUID del participante) para obtener la URL firmada.
        </p>
      )}
      {err && <p className="mt-6 text-sm text-red-600">{err}</p>}
      {loading && <p className="mt-6 text-sm text-slate-600">Cargando…</p>}
      {blobUrl && !loading && meta?.viewer_type !== "external_link" && (
        <div className="mt-8 space-y-3">
          {meta?.allow_download === true && (
            <a className="text-sm underline" href={blobUrl} download={`${materialId}.pdf`}>
              Descargar
            </a>
          )}
          <iframe src={blobUrl} title={meta?.title ?? "PDF"} className="h-[80vh] w-full rounded-2xl border border-slate-200" />
        </div>
      )}
    </main>
  );
}
