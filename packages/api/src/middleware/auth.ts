import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { AuthError, ForbiddenError } from "../utils/errors";
import type { AppUser } from "../types/user";
import * as users from "../services/users";

export type JwtClaims = Record<string, string | undefined>;

export type AuthContext = {
  claims: JwtClaims;
  dbUser?: AppUser;
};

export function getClaims(event: APIGatewayProxyEventV2): JwtClaims {
  const jwt = (
    event.requestContext as {
      authorizer?: { jwt?: { claims?: JwtClaims } };
    }
  ).authorizer?.jwt?.claims;
  if (!jwt?.sub) throw new AuthError("Missing JWT claims");
  return jwt;
}

export async function buildAuth(event: APIGatewayProxyEventV2): Promise<AuthContext> {
  const claims = getClaims(event);
  const dbUser = claims.sub ? await users.getUser(claims.sub) : undefined;
  return { claims, dbUser };
}

export function roleOf(ctx: AuthContext): AppUser["role"] | undefined {
  return ctx.dbUser?.role ?? (ctx.claims["custom:role"] as AppUser["role"] | undefined);
}

export function assertTenantAccess(ctx: AuthContext, tenantId: string) {
  const r = roleOf(ctx);
  if (r === "super_admin") return;
  if (!r) throw new ForbiddenError();
  if (r === "tenant_admin" || r === "staff") {
    const tid = ctx.dbUser?.tenant_id ?? ctx.claims["custom:tenant_id"];
    if (tid !== tenantId) throw new ForbiddenError();
    return;
  }
  if (r === "agency_admin") {
    const managed = ctx.dbUser?.managed_tenant_ids ?? [];
    if (!managed.length || managed.includes(tenantId)) return;
    throw new ForbiddenError();
  }
  throw new ForbiddenError();
}

export function assertRoles(ctx: AuthContext, allowed: Array<NonNullable<AppUser["role"]>>) {
  const r = roleOf(ctx);
  if (!r || !allowed.includes(r)) throw new ForbiddenError();
}
