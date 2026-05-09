import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { readEnv } from "../config/env";

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getSecretString(arn: string, region: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(arn);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = res.SecretString ?? "";
  cache.set(arn, { value, at: now });
  return value;
}

export async function getElevenLabsApiKey(): Promise<string> {
  const env = readEnv();
  if (env.elevenLabsApiKey) return env.elevenLabsApiKey;
  if (!env.elevenLabsSecretArn) throw new Error("Missing ElevenLabs credentials");
  const raw = await getSecretString(env.elevenLabsSecretArn, env.region);
  try {
    const json = JSON.parse(raw) as { apiKey?: string };
    if (json.apiKey) return json.apiKey;
  } catch {
    /* plain secret string */
  }
  return raw.trim();
}
