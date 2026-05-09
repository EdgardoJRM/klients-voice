import { ZodSchema } from "zod";
import { ValidationError } from "./errors";

export function parseSchema<T>(schema: ZodSchema<T>, input: unknown, message = "Invalid input"): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(message, r.error.flatten());
  }
  return r.data;
}
