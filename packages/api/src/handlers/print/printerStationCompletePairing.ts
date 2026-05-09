import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { printerStationCompletePairingSchema } from "../../schemas/printerStation.schema";
import * as stations from "../../services/printerStations";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

/** Public — no JWT. Pairing proves possession of short-lived code displayed in dashboard. */
export async function handlePrinterStationCompletePairing(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const body = parseSchema(printerStationCompletePairingSchema, parseJsonBody(event));
    const { station, station_token } = await stations.activatePairing(body);
    return ok({
      station_id: station.station_id,
      tenant_id: station.tenant_id,
      event_id: station.event_id,
      station_name: station.station_name,
      station_token,
      api_base_url_hint: "",
    });
  } catch (e) {
    return fail(e);
  }
}
