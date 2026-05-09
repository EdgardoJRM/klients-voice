import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { printerStationHeartbeatSchema } from "../../schemas/printerStation.schema";
import * as stations from "../../services/printerStations";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handlePrinterStationHeartbeat(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const raw = event.body ? parseJsonBody(event) : {};
    const body = parseSchema(printerStationHeartbeatSchema, raw);
    const h =
      event.headers["x-station-token"] ??
      event.headers["X-Station-Token"] ??
      event.headers["x-station-authorization"];
    const station = await stations.validateStationAuth(h ?? undefined);
    await stations.heartbeatStationRecord(station.station_id, body);
    return ok({ station_id: station.station_id, status: "ok" });
  } catch (e) {
    return fail(e);
  }
}
