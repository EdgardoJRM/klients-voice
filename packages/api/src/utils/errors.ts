export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, opts: { statusCode?: number; code?: string } = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = opts.statusCode ?? 500;
    this.code = opts.code ?? "INTERNAL";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, { statusCode: 400, code: "VALIDATION" });
    this.name = "ValidationError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, { statusCode: 401, code: "UNAUTHORIZED" });
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, { statusCode: 403, code: "FORBIDDEN" });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
    this.name = "NotFoundError";
  }
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === "object" && e !== null && "statusCode" in e && e instanceof Error;
}
