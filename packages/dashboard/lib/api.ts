const RAW = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Base URL del HttpApi; fuerza https:// si falta el esquema (evita fallos desde Vercel HTTPS). */
export function apiBaseUrl(): string {
  let u = RAW.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  } else {
    u = u.replace(/^http:\/\//i, "https://");
  }
  return u.replace(/\/$/, "");
}

export async function apiFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const base = apiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return fetch(url, { ...init, headers });
}
