import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { requestMagicLinkForEmail } from "../../services/magicLinkAuth";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { AppError, ValidationError } from "../../utils/errors";
import { parseSchema } from "../../utils/validation";

const schema = z.object({ email: z.string().email() }).strict();

/** Convierte errores típicos de Cognito/SES en respuestas HTTP con mensaje legible. */
function mapMagicLinkFailure(err: unknown): unknown {
  if (err instanceof ValidationError || err instanceof AppError) return err;
  if (!err || typeof err !== "object") return err;

  const name = "name" in err && typeof (err as { name: unknown }).name === "string" ? (err as { name: string }).name : "";
  const message = err instanceof Error ? err.message : "";

  if (name === "InvalidPasswordException" || message.includes("does not conform to policy")) {
    return new AppError(
      "La política de contraseñas de Cognito rechazó la clave temporal del enlace mágico; contacta soporte o inicia sesión con contraseña.",
      { statusCode: 503, code: "COGNITO_PASSWORD_POLICY" },
    );
  }
  if (
    name === "MessageRejected" ||
    name === "MailFromDomainNotVerifiedException" ||
    name === "ConfigurationSetDoesNotExistException" ||
    message.includes("Email address is not verified") ||
    (message.includes("not verified") && /email/i.test(message))
  ) {
    return new AppError(
      "No se pudo enviar el correo: en SES modo sandbox el destinatario debe estar verificado, o revisa el remitente y el dominio.",
      { statusCode: 503, code: "SES_SEND_FAILED" },
    );
  }
  if (name === "LimitExceededException" || name === "TooManyRequestsException") {
    return new AppError("Demasiados intentos; espera un momento e inténtalo de nuevo.", {
      statusCode: 429,
      code: "RATE_LIMIT",
    });
  }
  return err;
}

/**
 * Public — sends SES email with one-time link to dashboard /login/magic?t=...
 * Requires MAGIC_LINK_APP_URL (dashboard base) + SES_FROM_EMAIL + Cognito env on Lambda.
 */
export async function handleRequestMagicLink(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const body = parseJsonBody(event);
    const { email } = parseSchema(schema, body);
    const appBase =
      process.env.MAGIC_LINK_APP_URL?.trim() ||
      process.env.APP_BASE_URL?.trim() ||
      "";
    await requestMagicLinkForEmail(email, appBase);
    return ok({ sent: true });
  } catch (e) {
    return fail(mapMagicLinkFailure(e));
  }
}
