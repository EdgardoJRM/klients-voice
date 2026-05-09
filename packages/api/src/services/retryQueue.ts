import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { readEnv } from "../config/env";

export type RetryMessage = {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  call_type: "confirmation" | "reminder" | "followup";
  delaySeconds?: number;
};

export async function enqueueCallRetry(msg: RetryMessage) {
  const env = readEnv();
  if (!env.retryQueueUrl) return;
  const client = new SQSClient({ region: env.region });
  const delay = Math.min(900, Math.max(0, msg.delaySeconds ?? 60));
  await client.send(
    new SendMessageCommand({
      QueueUrl: env.retryQueueUrl,
      MessageBody: JSON.stringify({
        tenant_id: msg.tenant_id,
        event_id: msg.event_id,
        participant_id: msg.participant_id,
        call_type: msg.call_type,
      }),
      DelaySeconds: delay,
    }),
  );
}
