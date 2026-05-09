/** Best-effort E.164 without external deps. defaultRegion: ISO 3166-1 alpha-2 (e.g. US, PR) */

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function normalizePhoneE164(
  input: string | undefined,
  defaultRegion: string = "US",
): string | undefined {
  if (!input) return undefined;
  let s = input.trim();
  if (s.startsWith("+")) {
    const d = onlyDigits(s);
    if (!d) return undefined;
    return `+${d}`;
  }
  const digits = onlyDigits(s);
  if (!digits) return undefined;

  if (defaultRegion === "US" || defaultRegion === "PR") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return undefined;
}

export function isLikelyE164(phone: string) {
  return /^\+\d{8,15}$/.test(phone);
}
