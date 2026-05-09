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

function formatListTenantsError(json: { error?: { message?: string; code?: string } }): string {
  const message = json.error?.message ?? "";
  if (message === "Forbidden" || json.error?.code === "FORBIDDEN") {
    return "FORBIDDEN_SUPER";
  }
  return typeof message === "string" && message.length > 0 ? message : "Error API";
}

function ForbiddenSuperInstructions() {
  return (
    <div className="space-y-4 text-red-950">
      <p className="font-medium leading-relaxed">
        Esta pantalla lista <strong>todos los tenants</strong>. El API solo la permite si tu JWT lleva rol{" "}
        <code className="rounded bg-white/80 px-1">super_admin</code> o{" "}
        <code className="rounded bg-white/80 px-1">agency_admin</code>. Con un login normal por enlace mágico sueles tener{" "}
        <code className="rounded bg-white/80 px-1">tenant_admin</code> — usa{" "}
        <Link href="/dashboard" className="font-medium underline">
          /dashboard
        </Link>{" "}
        para tu organización.
      </p>
      <div className="rounded-lg border border-red-200 bg-white/90 p-4 text-sm leading-relaxed text-slate-800">
        <p className="font-semibold text-slate-900">Si de verdad necesitas rol global</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            En AWS: <strong>Cognito</strong> → tu user pool → <strong>Users</strong> → el usuario (por email) →{" "}
            <strong>Edit</strong>.
          </li>
          <li>
            Atributo <code className="rounded bg-slate-100 px-1">custom:role</code> ={" "}
            <code className="rounded bg-slate-100 px-1">super_admin</code> (o <code className="rounded bg-slate-100 px-1">agency_admin</code>{" "}
            si gestionas varios tenants).
          </li>
          <li>
            Guarda, luego <strong>cierra sesión</strong> en el dashboard (borra <code className="rounded bg-slate-100 px-1">kv_token</code> en
            localStorage o vuelve a <Link href="/login" className="font-medium underline">/login</Link>) y entra otra vez para que el{" "}
            <strong>id token</strong> traiga el rol nuevo.
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-600">
          El enlace mágico actual asigna <code className="rounded bg-slate-100 px-1">tenant_admin</code> para un tenant concreto; no promueve a
          super_admin automáticamente.
        </p>
      </div>
    </div>
  );
}

export default function SuperDashboardPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("kv_token") : null;
    if (!t) {
      setLoading(false);
      setErr("Falta token — ve a /login (Cognito o pega JWT en localStorage kv_token).");
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch("/tenants", { method: "GET", token: t });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(formatListTenantsError(json));
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
        {err && (
          <div className="p-6 text-sm text-red-600">
            {err === "FORBIDDEN_SUPER" ? (
              <ForbiddenSuperInstructions />
            ) : (
              <p>{err}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-4">
              <Link href="/login" className="font-medium text-red-800 underline">
                Ir a /login
              </Link>
              <Link href="/dashboard" className="font-medium text-red-800 underline">
                Ir al dashboard de tenant
              </Link>
            </div>
          </div>
        )}
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
