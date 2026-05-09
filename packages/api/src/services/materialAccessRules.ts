import type { MaterialAccessRecord, MaterialRecord } from "../types/material";
import type { ParticipantRecord } from "../types/participant";

/**
 * Server-side access decision for a material (does not trust client).
 * Order: revoked/locked explicit rows, then unlocked grant, then access_rule.
 */
export function participantCanAccessMaterial(args: {
  material: MaterialRecord;
  participant: ParticipantRecord;
  accessRow?: MaterialAccessRecord | undefined;
}): boolean {
  const { material, participant, accessRow } = args;
  if (material.status !== "active") return false;
  if (participant.event_id !== material.event_id || participant.tenant_id !== material.tenant_id) {
    return false;
  }
  if (accessRow?.access_status === "revoked") return false;
  if (accessRow?.access_status === "locked") return false;
  if (accessRow?.access_status === "unlocked") return true;

  switch (material.access_rule) {
    case "manual":
      return false;
    case "registered":
      return participant.registration_status === "registered" || participant.registration_status === "attended";
    case "confirmed":
      return participant.attendance_status === "confirmed";
    case "scanned":
      return participant.checked_in === true;
    default:
      return false;
  }
}
