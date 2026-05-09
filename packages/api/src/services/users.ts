import { readEnv } from "../config/env";
import type { AppUser } from "../types/user";
import { ddGet, ddPut, getDocClient } from "./dynamodb";

export async function getUser(userId: string): Promise<AppUser | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const item = await ddGet({
    client,
    table: env.tableUsers,
    key: { user_id: userId },
  });
  return item as AppUser | undefined;
}

export async function putUser(user: AppUser) {
  const env = readEnv();
  const client = getDocClient(env.region);
  await ddPut({ client, table: env.tableUsers, item: user as unknown as Record<string, unknown> });
}
