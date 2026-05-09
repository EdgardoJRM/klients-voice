"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: { code?: string; message?: string } };

export default function MagicVerifyClient({ token }: { token: string | undefined }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token?.trim()) {
      setMsg("Enlace inválido o caducado — pide un nuevo enlace en /login.");
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (!apiBase) {
      setMsg("Falta NEXT_PUBLIC_API_URL en el build.");
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await apiFetch("/auth/magic-link/verify", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = (await res.json()) as ApiEnvelope<{
        id_token: string;
        access_token: string;
        refresh_token?: string;
      }>;
      if (cancelled) return;
      if (!res.ok || !json.success || !("data" in json) || !json.data?.id_token) {
        const m =
          !json.success && json.error?.message
            ? json.error.message
            : "No se pudo completar el acceso.";
        setMsg(m);
        return;
      }
      localStorage.setItem("kv_token", json.data.id_token);
      router.replace("/dashboard");
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-8 py-20">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Klients Voice</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Entrando…</h1>
        <p className="mt-2 text-sm text-slate-600">
          Estamos validando tu enlace mágico y guardando el token en{" "}
          <code className="rounded bg-slate-100 px-1">localStorage</code> como{" "}
          <code className="rounded bg-slate-100 px-1">kv_token</code>.
        </p>
      </div>
      {msg && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{msg}</p>
      )}
      <Link href="/login" className="text-center text-sm text-slate-500 underline">
        Volver al login
      </Link>
    </main>
  );
}
