import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type QueryCommandInput,
  type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";

let cachedClient: DynamoDBDocumentClient | undefined;

export function getDocClient(region: string) {
  if (cachedClient) return cachedClient;
  const dynamo = new DynamoDBClient({ region });
  cachedClient = DynamoDBDocumentClient.from(dynamo, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return cachedClient;
}

export async function ddGet(params: {
  client: DynamoDBDocumentClient;
  table: string;
  key: Record<string, unknown>;
}) {
  const res = await params.client.send(
    new GetCommand({ TableName: params.table, Key: params.key as never }),
  );
  return res.Item as Record<string, unknown> | undefined;
}

export async function ddPut(params: {
  client: DynamoDBDocumentClient;
  table: string;
  item: Record<string, unknown>;
}) {
  await params.client.send(
    new PutCommand({ TableName: params.table, Item: params.item as never }),
  );
}

export async function ddQueryAll(params: {
  client: DynamoDBDocumentClient;
  input: Omit<QueryCommandInput, "ExclusiveStartKey">;
}) {
  const items: Record<string, unknown>[] = [];
  let startKey: QueryCommandInput["ExclusiveStartKey"];
  for (;;) {
    const res = await params.client.send(
      new QueryCommand({
        ...params.input,
        ExclusiveStartKey: startKey,
      }),
    );
    if (res.Items?.length) {
      items.push(...(res.Items as Record<string, unknown>[]));
    }
    startKey = res.LastEvaluatedKey;
    if (!startKey) break;
  }
  return items;
}

export async function ddScanPaginated(params: {
  client: DynamoDBDocumentClient;
  TableName: string;
  ProjectionExpression?: string;
  Limit?: number;
  FilterExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  for (;;) {
    const cmd = new ScanCommand({
      TableName: params.TableName,
      ProjectionExpression: params.ProjectionExpression,
      Limit: params.Limit,
      FilterExpression: params.FilterExpression,
      ExpressionAttributeNames: params.ExpressionAttributeNames,
      ExpressionAttributeValues: params.ExpressionAttributeValues,
      ExclusiveStartKey: startKey,
    });
    const res = (await params.client.send(cmd)) as ScanCommandOutput;
    if (res.Items?.length) {
      items.push(...(res.Items as Record<string, unknown>[]));
    }
    startKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (!startKey) break;
  }
  return items;
}

export async function ddUpdate(params: {
  client: DynamoDBDocumentClient;
  table: string;
  key: Record<string, unknown>;
  updateExpression: string;
  names?: Record<string, string>;
  values: Record<string, unknown>;
}) {
  await params.client.send(
    new UpdateCommand({
      TableName: params.table,
      Key: params.key as never,
      UpdateExpression: params.updateExpression,
      ExpressionAttributeNames: params.names,
      ExpressionAttributeValues: params.values as never,
      ReturnValues: "ALL_NEW",
    }),
  );
}
