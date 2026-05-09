import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-8 py-20">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Klients Voice</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-slate-600">
          Usa Cognito (email/clave). Tras obtener el JWT, cópialo en el dashboard para pruebas locales.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">
          En producción, conecta aquí el flujo SRP con{" "}
          <code className="rounded bg-slate-100 px-1">amazon-cognito-identity-js</code>. Por ahora,
          guarda el token en <code className="rounded bg-slate-100 px-1">localStorage</code> como{" "}
          <code className="rounded bg-slate-100 px-1">kv_token</code>.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex w-full justify-center rounded-xl bg-slate-900 py-3 text-sm font-medium text-white"
        >
          Ir al dashboard de prueba
        </Link>
      </div>
      <Link href="/" className="text-center text-sm text-slate-500 underline">
        Volver
      </Link>
    </main>
  );
}
