import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { requestMagicLinkForEmail } from "../../services/magicLinkAuth";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

const schema = z.object({ email: z.string().email() }).strict();

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
    return fail(e);
  }
}
