import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { z } from "zod";
import { verifyMagicLinkToken } from "../../services/magicLinkAuth";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

const schema = z.object({ token: z.string().min(8) }).strict();

/** Public — exchanges one-time magic token for Cognito tokens (browser stores id_token as kv_token). */
export async function handleVerifyMagicLink(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const body = parseJsonBody(event);
    const { token } = parseSchema(schema, body);
    const tokens = await verifyMagicLinkToken(token);
    return ok(tokens);
  } catch (e) {
    return fail(e);
  }
}
