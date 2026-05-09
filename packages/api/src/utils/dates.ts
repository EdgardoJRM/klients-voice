/** Lightweight helpers; full TZ handling should use tenant timezone in UI. */

export function nowIso() {
  return new Date().toISOString();
}

/** Extract HH:mm from HH:mm or HH:mm:ss */
export function normalizeTime(t?: string): string | undefined {
  if (!t) return undefined;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return undefined;
  return `${m[1]}:${m[2]}`;
}

/**
 * Returns minutes since midnight in local interpretation (server TZ).
 * Best-effort for call window checks when client sends local HH:mm.
 */
export function parseTimeToMinutes(time?: string): number | undefined {
  const n = normalizeTime(time);
  if (!n) return undefined;
  const [hh, mm] = n.split(":").map((x) => Number(x));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
  return hh * 60 + mm;
}

export function currentMinutesLocal(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function withinWindow(
  windowStart?: string,
  windowEnd?: string,
): boolean {
  const s = parseTimeToMinutes(windowStart);
  const e = parseTimeToMinutes(windowEnd);
  if (s == null || e == null) return true;
  const now = currentMinutesLocal();
  if (s <= e) return now >= s && now <= e;
  return now >= s || now <= e;
}
