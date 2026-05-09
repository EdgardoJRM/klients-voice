import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import * as middleware from "../../middleware/auth";
import * as events from "../../services/events";
import { printerStationPairCodeSchema } from "../../schemas/printerStation.schema";
import * as stations from "../../services/printerStations";
import { NotFoundError } from "../../utils/errors";
import { ok, fail, parseJsonBody } from "../../utils/response";
import { parseSchema } from "../../utils/validation";

export async function handlePrinterStationPairCode(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const ctx = await middleware.buildAuth(event);
    middleware.assertRoles(ctx, ["super_admin", "agency_admin", "tenant_admin", "staff"]);
    const body = parseSchema(printerStationPairCodeSchema, parseJsonBody(event));
    const evt = await events.getEvent(body.event_id);
    if (!evt) throw new NotFoundError("event");
    middleware.assertTenantAccess(ctx, body.tenant_id);
    if (evt.tenant_id !== body.tenant_id) throw new NotFoundError("event");

    const { station, pairing_code } = await stations.createStationWithPairingCode(body);
    return ok({
      station_id: station.station_id,
      pairing_code,
      expires_in_seconds: 600,
    });
  } catch (e) {
    return fail(e);
  }
}
