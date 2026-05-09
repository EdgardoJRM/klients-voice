import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AppError, ValidationError } from "./errors";

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
};

export function json<T>(statusCode: number, body: ApiResponse<T>) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function ok<T>(data: T) {
  return json<T>(200, { success: true, data });
}

export function created<T>(data: T) {
  return json<T>(201, { success: true, data });
}

export function fail(err: unknown) {
  if (err instanceof ValidationError) {
    return json(err.statusCode, {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err instanceof AppError) {
    return json(err.statusCode, {
      success: false,
      error: { code: err.code, message: err.message },
    });
  }
  console.error("Unhandled error", err);
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return json(500, {
    success: false,
    error: { code: "INTERNAL", message },
  });
}

export function parseJsonBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) throw new AppError("Missing body", { statusCode: 400, code: "BAD_REQUEST" });
  try {
    const raw =
      event.isBase64Encoded && typeof event.body === "string"
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;
    return JSON.parse(raw as string) as T;
  } catch {
    throw new AppError("Invalid JSON body", { statusCode: 400, code: "BAD_REQUEST" });
  }
}
