import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handleCreateTenant } from "../handlers/tenants/createTenant";
import { handleListTenants } from "../handlers/tenants/listTenants";
import { handleCreateEvent } from "../handlers/events/createEvent";
import { handleListEvents } from "../handlers/events/listEvents";
import { handleGetEvent } from "../handlers/events/getEvent";
import { handlePatchEvent } from "../handlers/events/patchEvent";
import { handleGetEventParticipants } from "../handlers/events/getEventParticipants";
import { handleGetEventAnalytics } from "../handlers/events/getEventAnalytics";
import { handleGetTenantAnalytics } from "../handlers/analytics/getTenantAnalytics";
import { handleStartCalls } from "../handlers/calls/startCalls";
import { handleRetryCalls } from "../handlers/calls/retryCalls";
import { handleClickfunnelsWebhook } from "../handlers/webhooks/clickfunnelsWebhook";
import { handleElevenLabsPostCall } from "../handlers/webhooks/postCallElevenLabs";
import { handleScannerValidate } from "../handlers/scanner/validateScan";
import { handleResendParticipantQr } from "../handlers/participants/resendParticipantQr";
import { handlePatchParticipantMaterialAccess } from "../handlers/participants/patchParticipantMaterialAccess";
import { handleCreateMaterial } from "../handlers/materials/createMaterial";
import { handleListEventMaterials } from "../handlers/materials/listEventMaterials";
import { handleListParticipantMaterials } from "../handlers/materials/listParticipantMaterials";
import { handleGrantMaterialAccess } from "../handlers/materials/grantMaterialAccess";
import { handleMaterialSignedUrl } from "../handlers/materials/materialSignedUrl";
import { handleAttachMaterialAsset } from "../handlers/materials/attachMaterialAsset";
import { handleListPrintJobs } from "../handlers/print/listPrintJobs";
import { handleClaimPrintJob } from "../handlers/print/claimPrintJob";
import { handleCompletePrintJob } from "../handlers/print/completePrintJob";
import { handleFailPrintJob } from "../handlers/print/failPrintJob";
import { handleTestPrint } from "../handlers/print/testPrint";
import { handlePrinterStationPairCode } from "../handlers/print/printerStationPairCode";
import { handlePrinterStationCompletePairing } from "../handlers/print/printerStationCompletePairing";
import { handlePrinterStationHeartbeat } from "../handlers/print/printerStationHeartbeat";
import {
  handleStationListJobs,
  handleStationClaimJob,
  handleStationCompleteJob,
  handleStationFailJob,
  handleStationTestPrint,
} from "../handlers/station/stationJobs";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization,content-type,x-klients-signature,x-webhook-secret,elevenlabs-signature,x-station-token",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

function withCors(r: APIGatewayProxyStructuredResultV2): APIGatewayProxyStructuredResultV2 {
  return {
    ...r,
    headers: { ...(r.headers ?? {}), ...cors },
  };
}

async function dispatchStationPublicRoutes(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2 | null> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (path === "/printer-stations/complete-pairing" && method === "POST") {
    return withCors(await handlePrinterStationCompletePairing(event));
  }

  if (path === "/printer-stations/heartbeat" && method === "POST") {
    return withCors(await handlePrinterStationHeartbeat(event));
  }

  if (path === "/station/jobs" && method === "GET") {
    return withCors(await handleStationListJobs(event));
  }

  if (path === "/station/jobs/test-print" && method === "POST") {
    return withCors(await handleStationTestPrint(event));
  }

  const scm = path.match(/^\/station\/jobs\/([^/]+)\/claim$/);
  if (scm && method === "POST") return withCors(await handleStationClaimJob(event, scm[1]!));

  const sdone = path.match(/^\/station\/jobs\/([^/]+)\/complete$/);
  if (sdone && method === "POST") return withCors(await handleStationCompleteJob(event, sdone[1]!));

  const sfail = path.match(/^\/station\/jobs\/([^/]+)\/fail$/);
  if (sfail && method === "POST") return withCors(await handleStationFailJob(event, sfail[1]!));

  return null;
}

export async function publicHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === "OPTIONS") return withCors({ statusCode: 204, body: "" });

  const m1 = path.match(/^\/webhooks\/clickfunnels\/([^/]+)$/);
  if (m1 && method === "POST") {
    return withCors(await handleClickfunnelsWebhook(event, decodeURIComponent(m1[1]!)));
  }

  if (path === "/webhooks/elevenlabs/post-call" && method === "POST") {
    return withCors(await handleElevenLabsPostCall(event));
  }

  const stationEarly = await dispatchStationPublicRoutes(event);
  if (stationEarly) return stationEarly;

  return withCors({ statusCode: 404, body: JSON.stringify({ success: false, error: "NOT_FOUND" }) });
}

export async function privateHandler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === "OPTIONS") return withCors({ statusCode: 204, body: "" });

  if (path.startsWith("/webhooks/")) {
    return withCors({ statusCode: 404, body: JSON.stringify({ success: false, error: "NOT_FOUND" }) });
  }

  if (path === "/tenants" && method === "POST") return withCors(await handleCreateTenant(event));
  if (path === "/tenants" && method === "GET") return withCors(await handleListTenants(event));

  if (path === "/events" && method === "POST") return withCors(await handleCreateEvent(event));
  if (path === "/events" && method === "GET") return withCors(await handleListEvents(event));

  const eve = path.match(/^\/events\/([^/]+)$/);
  if (eve && method === "GET") return withCors(await handleGetEvent(event, eve[1]!));
  if (eve && method === "PATCH") return withCors(await handlePatchEvent(event, eve[1]!));

  if (path === "/printer-stations/pair-code" && method === "POST") {
    return withCors(await handlePrinterStationPairCode(event));
  }

  if (path === "/scanner/validate" && method === "POST") {
    return withCors(await handleScannerValidate(event));
  }

  if (path === "/materials" && method === "POST") {
    return withCors(await handleCreateMaterial(event));
  }

  const em = path.match(/^\/events\/([^/]+)\/materials$/);
  if (em && method === "GET") {
    return withCors(await handleListEventMaterials(event, em[1]!));
  }

  const pm = path.match(/^\/participants\/([^/]+)\/materials$/);
  if (pm && method === "GET") {
    return withCors(await handleListParticipantMaterials(event, pm[1]!));
  }

  const mga = path.match(/^\/materials\/([^/]+)\/grant-access$/);
  if (mga && method === "POST") {
    return withCors(await handleGrantMaterialAccess(event, mga[1]!));
  }

  const msu = path.match(/^\/materials\/([^/]+)\/signed-url$/);
  if (msu && method === "POST") {
    return withCors(await handleMaterialSignedUrl(event, msu[1]!));
  }

  const mass = path.match(/^\/materials\/([^/]+)\/asset$/);
  if (mass && method === "POST") {
    return withCors(await handleAttachMaterialAsset(event, mass[1]!));
  }

  if (path === "/print-jobs" && method === "GET") {
    return withCors(await handleListPrintJobs(event));
  }

  if (path === "/print-jobs/test-print" && method === "POST") {
    return withCors(await handleTestPrint(event));
  }

  const pjc = path.match(/^\/print-jobs\/([^/]+)\/claim$/);
  if (pjc && method === "POST") {
    return withCors(await handleClaimPrintJob(event, pjc[1]!));
  }

  const pjdone = path.match(/^\/print-jobs\/([^/]+)\/complete$/);
  if (pjdone && method === "POST") {
    return withCors(await handleCompletePrintJob(event, pjdone[1]!));
  }

  const pjfail = path.match(/^\/print-jobs\/([^/]+)\/fail$/);
  if (pjfail && method === "POST") {
    return withCors(await handleFailPrintJob(event, pjfail[1]!));
  }

  const rq = path.match(/^\/events\/([^/]+)\/participants\/([^/]+)\/resend-qr$/);
  if (rq && method === "POST") {
    return withCors(await handleResendParticipantQr(event, rq[1]!, rq[2]!));
  }

  const ma = path.match(/^\/events\/([^/]+)\/participants\/([^/]+)\/material-access$/);
  if (ma && method === "POST") {
    return withCors(await handlePatchParticipantMaterialAccess(event, ma[1]!, ma[2]!));
  }

  const ep = path.match(/^\/events\/([^/]+)\/participants$/);
  if (ep && method === "GET") return withCors(await handleGetEventParticipants(event, ep[1]!));

  const ea = path.match(/^\/events\/([^/]+)\/analytics$/);
  if (ea && method === "GET") return withCors(await handleGetEventAnalytics(event, ea[1]!));

  const ta = path.match(/^\/analytics\/([^/]+)$/);
  if (ta && method === "GET") return withCors(await handleGetTenantAnalytics(event, ta[1]!));

  if (path === "/calls/start" && method === "POST") return withCors(await handleStartCalls(event));
  if (path === "/calls/retry" && method === "POST") return withCors(await handleRetryCalls(event));

  return withCors({ statusCode: 404, body: JSON.stringify({ success: false, error: "NOT_FOUND" }) });
}

/** Local/dev single entry combining public + private (no API Gateway JWT splits). */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const path = event.rawPath;
  if (path.startsWith("/webhooks/")) return publicHandler(event);
  const station = await dispatchStationPublicRoutes(event);
  if (station) return station;
  return privateHandler(event);
}
