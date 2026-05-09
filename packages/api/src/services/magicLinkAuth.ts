import { randomBytes, randomUUID } from "crypto";
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminInitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { readEnv } from "../config/env";
import { getDocClient } from "./dynamodb";
import { AppError, NotFoundError, ValidationError } from "../utils/errors";

const LINK_TTL_SEC = 15 * 60;

export type MagicLinkRecord = {
  token: string;
  email: string;
  password: string;
  expires_at: string;
  ttl: number;
};

function table(): string {
  const t = process.env.TABLE_MAGIC_LINKS;
  if (!t) throw new Error("TABLE_MAGIC_LINKS not set");
  return t;
}

function poolId(): string {
  const v = process.env.COGNITO_USER_POOL_ID;
  if (!v) throw new Error("COGNITO_USER_POOL_ID not set");
  return v;
}

function clientId(): string {
  const v = process.env.COGNITO_CLIENT_ID;
  if (!v) throw new Error("COGNITO_CLIENT_ID not set");
  return v;
}

function cip() {
  const env = readEnv();
  return new CognitoIdentityProviderClient({ region: env.region });
}

/** Meets typical Cognito pool policy (lower, upper, number, symbol) for AdminSetUserPassword */
function oneTimePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const required = [
    upper[randomBytes(1)[0]! % upper.length]!,
    lower[randomBytes(1)[0]! % lower.length]!,
    digits[randomBytes(1)[0]! % digits.length]!,
    symbols[randomBytes(1)[0]! % symbols.length]!,
  ];
  const all = upper + lower + digits + symbols;
  const targetLen = 48;
  const chars: string[] = [...required];
  const extra = randomBytes(targetLen - required.length);
  for (let i = 0; i < extra.length; i++) {
    chars.push(all[extra[i]! % all.length]!);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    const a = chars[i]!;
    const b = chars[j]!;
    chars[i] = b;
    chars[j] = a;
  }
  return chars.join("");
}

export async function requestMagicLinkForEmail(email: string, appBaseUrl: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new ValidationError("Invalid email");
  }
  if (!appBaseUrl.trim()) {
    throw new AppError("Magic link base URL not configured (set AppBaseUrl / MAGIC_LINK_APP_URL)", {
      statusCode: 503,
      code: "MAGIC_LINK_CONFIG",
    });
  }

  const from = process.env.SES_FROM_EMAIL?.trim();
  if (!from) {
    throw new AppError("SES_FROM_EMAIL is not configured; cannot send magic link", {
      statusCode: 503,
      code: "SES_NOT_CONFIGURED",
    });
  }

  const client = cip();
  const userPoolId = poolId();

  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: normalized,
      }),
    );
  } catch (e: unknown) {
    const name = e && typeof e === "object" && "name" in e ? (e as { name?: string }).name : "";
    if (name === "UserNotFoundException") {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: normalized,
          UserAttributes: [
            { Name: "email", Value: normalized },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS",
        }),
      );
    } else {
      throw e;
    }
  }

  const password = oneTimePassword();
  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: normalized,
      Password: password,
      Permanent: true,
    }),
  );

  const token = randomUUID();
  const now = Date.now();
  const expires = new Date(now + LINK_TTL_SEC * 1000).toISOString();
  const ttl = Math.floor(now / 1000) + LINK_TTL_SEC + 300;

  const doc = getDocClient(readEnv().region);
  await doc.send(
    new PutCommand({
      TableName: table(),
      Item: {
        token,
        email: normalized,
        password,
        expires_at: expires,
        ttl,
      },
    }),
  );

  const base = appBaseUrl.replace(/\/$/, "");
  const url = `${base}/login/magic?t=${encodeURIComponent(token)}`;

  const { sendEmail } = await import("./ses");
  await sendEmail({
    tenant_id: "system",
    template_id: "magic_link",
    to: normalized,
    subject: "Tu enlace para entrar a Klients Voice",
    htmlBody: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:24px">
<p>Hola,</p>
<p>Toca el enlace para iniciar sesión (válido ~15 minutos):</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>
<p>Si no pediste esto, ignora este mensaje.</p>
</body></html>`,
  });

  console.log(JSON.stringify({ msg: "magic_link_sent", email: normalized }));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function verifyMagicLinkToken(token: string): Promise<{
  id_token: string;
  access_token: string;
  refresh_token: string | undefined;
}> {
  const t = token.trim();
  if (!t) throw new ValidationError("token required");

  const doc = getDocClient(readEnv().region);
  const row = await doc.send(
    new GetCommand({
      TableName: table(),
      Key: { token: t },
    }),
  );
  const item = row.Item as MagicLinkRecord | undefined;
  if (!item?.email || !item.password) {
    throw new NotFoundError("magic_link");
  }
  if (new Date(item.expires_at).getTime() < Date.now()) {
    await doc.send(new DeleteCommand({ TableName: table(), Key: { token: t } }));
    throw new AppError("Magic link expired", { statusCode: 400, code: "MAGIC_LINK_EXPIRED" });
  }

  const client = cip();
  let auth;
  try {
    auth = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: poolId(),
        ClientId: clientId(),
        AuthFlow: "ADMIN_NO_SRP_AUTH",
        AuthParameters: {
          USERNAME: item.email,
          PASSWORD: item.password,
        },
      }),
    );
  } catch (e) {
    console.error(JSON.stringify({ msg: "magic_link_auth_failed", err: String(e) }));
    throw new AppError("Could not complete sign-in", { statusCode: 401, code: "MAGIC_LINK_AUTH_FAILED" });
  }

  await doc.send(new DeleteCommand({ TableName: table(), Key: { token: t } }));

  const ar = auth.AuthenticationResult;
  if (!ar?.IdToken || !ar.AccessToken) {
    throw new AppError("Cognito returned no tokens", { statusCode: 502, code: "COGNITO_NO_TOKENS" });
  }

  console.log(JSON.stringify({ msg: "magic_link_consumed", email: item.email }));

  return {
    id_token: ar.IdToken,
    access_token: ar.AccessToken,
    refresh_token: ar.RefreshToken,
  };
}
