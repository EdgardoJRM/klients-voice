"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TenantRow = {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  status: string;
  plan: string;
};

export default function SuperDashboardPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("kv_token") : null;
    if (!t) {
      setLoading(false);
      setErr("Falta token (localStorage kv_token)");
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch("/tenants", { method: "GET", token: t });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message ?? "Error API");
        setRows(json.data as TenantRow[]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Super Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tenants</h1>
        </div>
        <Link href="/dashboard" className="text-sm text-slate-600 underline">
          Vista tenant
        </Link>
      </div>
      <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <p className="p-6 text-sm text-slate-500">Cargando…</p>}
        {err && <p className="p-6 text-sm text-red-600">{err}</p>}
        {!loading && !err && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tenant_id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.tenant_name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.tenant_slug}</td>
                  <td className="px-4 py-3 text-slate-600">{r.plan}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
