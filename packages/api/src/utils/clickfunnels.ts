export function coerceBool(input: unknown): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") {
    return ["true", "1", "yes", "on"].includes(input.toLowerCase());
  }
  return false;
}

export function extractClickfunnelsInner(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.data === "object" && body.data) {
    return body.data as Record<string, unknown>;
  }
  return body;
}
