"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type EventRow = {
  event_id: string;
  title: string;
  event_type: string;
  date: string;
};

export default function TenantDashboardPage() {
  const tenantId = process.env.NEXT_PUBLIC_KV_TENANT_ID ?? "";
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("kv_token");
    if (!tenantId) {
      setErr("Configura NEXT_PUBLIC_KV_TENANT_ID en .env.local");
      return;
    }
    if (!token) {
      setErr("Falta kv_token en localStorage");
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch(`/events?tenant_id=${encodeURIComponent(tenantId)}`, {
          method: "GET",
          token,
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Error");
        setEvents(json.data as EventRow[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [tenantId]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Tenant dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold">Eventos y webinars</h1>
          <p className="mt-2 text-sm text-slate-600">
            Diseño SaaS minimal — branding por tenant llegará desde la API (`branding`).
          </p>
        </div>
        <Link href="/super" className="text-sm text-slate-600 underline">
          Vista agencia / super admin
        </Link>
      </div>
      {err && <p className="mt-8 text-sm text-red-600">{err}</p>}
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {events.map((ev) => (
          <Link
            key={ev.event_id}
            href={`/dashboard/events/${ev.event_id}`}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
          >
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
              {ev.event_type}
            </span>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">{ev.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{ev.date}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
