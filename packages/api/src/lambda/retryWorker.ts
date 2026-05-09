import type { SQSEvent } from "aws-lambda";
import { placeOutboundForParticipant } from "../handlers/calls/startCalls";

type Msg = {
  tenant_id: string;
  event_id: string;
  participant_id: string;
  call_type?: "confirmation" | "reminder" | "followup";
};

export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const body = JSON.parse(record.body) as Msg;
    await placeOutboundForParticipant({
      tenant_id: body.tenant_id,
      event_id: body.event_id,
      participant_id: body.participant_id,
      call_type: body.call_type ?? "confirmation",
    });
  }
}
