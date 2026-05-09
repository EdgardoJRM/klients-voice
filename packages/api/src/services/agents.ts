import { readEnv } from "../config/env";
import type { AgentRecord } from "../types/agent";
import { ddGet, ddQueryAll, getDocClient } from "./dynamodb";

export async function getAgentById(id: string): Promise<AgentRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const item = await ddGet({
    client,
    table: env.tableAgents,
    key: { agent_config_id: id },
  });
  return item as AgentRecord | undefined;
}

export async function pickActiveAgentForTenant(tenantId: string): Promise<AgentRecord | undefined> {
  const env = readEnv();
  const client = getDocClient(env.region);
  const rows = await ddQueryAll({
    client,
    input: {
      TableName: env.tableAgents,
      IndexName: "TenantAgentIndex",
      KeyConditionExpression: "tenant_id = :t",
      ExpressionAttributeValues: { ":t": tenantId },
    },
  });
  const list = rows as unknown as AgentRecord[];
  return list.find((r) => r.status === "active");
}
