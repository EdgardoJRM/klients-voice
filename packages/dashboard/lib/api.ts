const RAW = process.env.NEXT_PUBLIC_API_URL ?? "";

export async function apiFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const url = `${RAW.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return fetch(url, { ...init, headers });
}
