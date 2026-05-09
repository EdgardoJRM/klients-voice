"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import {
  createCognitoUserPool,
  idTokenJwt,
  readCognitoPublicConfig,
  signInWithSrp,
} from "../../lib/cognitoSrp";

export default function LoginPage() {
  const router = useRouter();
  const isProduction = process.env.NODE_ENV === "production";

  const cognitoConfig = useMemo(() => readCognitoPublicConfig(), []);
  const poolConfigured = cognitoConfig !== null;
  const userPool = useMemo(
    () => (cognitoConfig ? createCognitoUserPool(cognitoConfig) : null),
    [cognitoConfig],
  );

  const apiConfigured = useMemo(() => (process.env.NEXT_PUBLIC_API_URL ?? "").trim().length > 0, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pasteToken, setPasteToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMagic, setOkMagic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMagic, setBusyMagic] = useState(false);

  function saveTokenAndGoHome(jwt: string) {
    const t = jwt.trim();
    if (!t) {
      setMsg("El token está vacío");
      return;
    }
    localStorage.setItem("kv_token", t);
    setMsg(null);
    router.push("/dashboard");
  }

  async function signInCognito(e: React.FormEvent) {
    e.preventDefault();
    if (!poolConfigured || !userPool) {
      setMsg("Configura NEXT_PUBLIC_COGNITO_USER_POOL_ID y NEXT_PUBLIC_COGNITO_CLIENT_ID");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const session = await signInWithSrp({
        username: email.trim(),
        password,
        userPool,
      });
      localStorage.setItem("kv_token", idTokenJwt(session));
      router.push("/dashboard");
    } catch (err: unknown) {
      const e = err as Error & { code?: string; message?: string };
      setMsg(e.message || e.code || "Error de autenticación");
    } finally {
      setBusy(false);
    }
  }

  async function requestMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!apiConfigured) {
      setMsg("Configura NEXT_PUBLIC_API_URL con la URL base del API (HttpApi output del stack SAM).");
      return;
    }
    const addr = email.trim();
    if (!addr) {
      setMsg("Introduce un email.");
      return;
    }
    setBusyMagic(true);
    setMsg(null);
    setOkMagic(null);
    try {
      const res = await apiFetch("/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email: addr }),
      });
      const json = (await res.json()) as
        | { success: true }
        | { success: false; error?: { message?: string } };
      if (!res.ok || !json.success) {
        const m = !json.success && json.error?.message ? json.error.message : "No se pudo enviar el enlace.";
        setMsg(m);
        return;
      }
      setOkMagic("Revisa tu correo: te enviamos un enlace (válido unos 15 minutos).");
    } catch {
      setMsg("Error de red al solicitar el enlace.");
    } finally {
      setBusyMagic(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-8 py-20">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Klients Voice</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-slate-600">
          Contraseña: autenticación <strong>Cognito SRP</strong> (<code className="rounded bg-slate-100 px-1">USER_SRP_AUTH</code>) con
          amazon-cognito-identity-js. El JWT del <strong>id token</strong> se guarda en{" "}
          <code className="rounded bg-slate-100 px-1">localStorage</code> como{" "}
          <code className="rounded bg-slate-100 px-1">kv_token</code> y se envía como{" "}
          <code className="rounded bg-slate-100 px-1">Authorization: Bearer</code>.
        </p>
      </div>

      {apiConfigured ? (
        <form onSubmit={requestMagicLink} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Enlace mágico (sin contraseña)</h2>
          <p className="text-xs text-slate-600">
            Te enviamos un correo con un enlace a <code className="rounded bg-slate-100 px-1">/login/magic?t=…</code> que completa el
            acceso.
          </p>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
          <input
            type="email"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busyMagic}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busyMagic ? "Enviando…" : "Enviar enlace al correo"}
          </button>
          {okMagic && <p className="text-sm text-emerald-700">{okMagic}</p>}
        </form>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Enlace mágico desactivado en este build</p>
          <p className="mt-1 text-xs opacity-90">
            Añade <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_API_URL</code> (URL del HttpApi) para solicitar enlaces por
            correo.
          </p>
        </div>
      )}

      {poolConfigured ? (
        <form onSubmit={signInCognito} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Email y contraseña (SRP)</h2>
          <p className="text-xs text-slate-600">
            Flujo seguro contra tu User Pool (<code className="rounded bg-slate-100 px-1">USER_SRP_AUTH</code>); la contraseña no va en
            claro al API HTTP.
          </p>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Email</label>
          <input
            type="email"
            autoComplete="username"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Contraseña</label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Entrando…" : "Entrar y guardar token"}
          </button>
        </form>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Faltan variables de Cognito en el build</p>
          <p className="mt-1 text-xs opacity-90">
            En Vercel / <code className="rounded bg-white/80 px-1">.env.local</code> define{" "}
            <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_COGNITO_USER_POOL_ID</code> y{" "}
            <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_COGNITO_CLIENT_ID</code> (outputs
            del stack <code className="rounded bg-white/80 px-1">klients-voice</code>), luego redeploy.
          </p>
        </div>
      )}

      {!isProduction && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">O pega un JWT (solo desarrollo)</h2>
          <p className="text-xs text-slate-600">
            Si ya tienes el token (por ejemplo de{" "}
            <code className="rounded bg-slate-100 px-1">aws cognito-idp initiate-auth</code>), pégalo aquí.
          </p>
          <textarea
            className="w-full min-h-[100px] rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
            placeholder="eyJraWQiOiJ..."
            value={pasteToken}
            onChange={(e) => setPasteToken(e.target.value)}
          />
          <button
            type="button"
            onClick={() => saveTokenAndGoHome(pasteToken)}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-900"
          >
            Guardar token e ir al dashboard
          </button>
        </div>
      )}

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <Link
        href="/dashboard"
        className="text-center text-sm text-slate-500 underline"
      >
        Ir al dashboard (si ya guardaste token antes)
      </Link>
      <Link href="/" className="text-center text-sm text-slate-500 underline">
        Volver
      </Link>
    </main>
  );
}
