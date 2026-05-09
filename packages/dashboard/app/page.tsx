import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-8">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Klients Voice</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
        Confirmaciones por voz impulsadas por IA
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        Dashboard multi-tenant para talleres, webinars y eventos. Conecta ClickFunnels, ElevenLabs y Twilio sin fricción.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
        >
          Entrar
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-900 shadow-sm hover:border-slate-300"
        >
          Ir al dashboard
        </Link>
      </div>
    </main>
  );
}
