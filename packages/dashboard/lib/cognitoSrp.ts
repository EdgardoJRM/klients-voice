import type { CognitoUserSession } from "amazon-cognito-identity-js";
import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";

/** Config pública expuesta en el bundle (NEXT_PUBLIC_*). Debe coincidir con el User Pool de producción. */
export type CognitoPublicConfig = {
  userPoolId: string;
  clientId: string;
};

export function readCognitoPublicConfig(): CognitoPublicConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() ?? "";
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim() ?? "";
  if (!userPoolId || !clientId) return null;
  return { userPoolId, clientId };
}

export function createCognitoUserPool(config: CognitoPublicConfig): CognitoUserPool {
  return new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.clientId,
  });
}

const CHALLENGE = {
  MFA_REQUIRED: "COGNITO_MFA_REQUIRED",
  TOTP_REQUIRED: "COGNITO_TOTP_REQUIRED",
  CUSTOM_AUTH: "COGNITO_CUSTOM_CHALLENGE",
  NEW_PASSWORD: "COGNITO_NEW_PASSWORD_REQUIRED",
} as const;

/**
 * Producción: `authenticateUser` con **`USER_SRP_AUTH`** — SRP en el cliente vía amazon-cognito-identity-js →
 * `InitiateAuth` con flujo USER_SRP_AUTH en Cognito. El **`id_token`** JWT es el habitual para Bearer con el API HTTP.
 */
export function signInWithSrp(params: {
  username: string;
  password: string;
  userPool: CognitoUserPool;
}): Promise<CognitoUserSession> {
  const username = params.username.trim();
  const user = new CognitoUser({ Username: username, Pool: params.userPool });

  /** Default del SDK ya es USER_SRP_AUTH; queda explícito para revisión / prod. */
  user.setAuthenticationFlowType("USER_SRP_AUTH");

  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: params.password,
  });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authenticationDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err: Error & { code?: string }) => reject(err),
      newPasswordRequired: () =>
        reject(Object.assign(new Error("Contraseña temporal: debes establecer una nueva."), { code: CHALLENGE.NEW_PASSWORD })),
      mfaRequired: () =>
        reject(Object.assign(new Error("La cuenta tiene MFA SMS; este dashboard aún no lo implementa."), { code: CHALLENGE.MFA_REQUIRED })),
      totpRequired: () =>
        reject(
          Object.assign(new Error("La cuenta tiene MFA TOTP; este dashboard aún no lo implementa."), { code: CHALLENGE.TOTP_REQUIRED }),
        ),
      customChallenge: () =>
        reject(Object.assign(new Error("CUSTOM_AUTH no soportado en este login."), { code: CHALLENGE.CUSTOM_AUTH })),
    });
  });
}

export function idTokenJwt(session: CognitoUserSession): string {
  return session.getIdToken().getJwtToken();
}
