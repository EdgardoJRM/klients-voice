import PDFDocument from "pdfkit";
import type { EventRecord } from "../types/event";
import type { ParticipantRecord } from "../types/participant";
import QRCode from "qrcode";

const PT_PER_INCH = 72;

/** 4"x6" label at 72 DPI (thermal-friendly vector output) */
export async function generateEventLabelPdf(args: {
  participant: ParticipantRecord;
  event: EventRecord;
  badge?: string;
  /** Business / tenant display name on default label */
  tenantName?: string;
}): Promise<Buffer> {
  const w = 4 * PT_PER_INCH;
  const h = 6 * PT_PER_INCH;

  let qrPng = Buffer.alloc(0);
  if (args.participant.qr_token) {
    const payload = JSON.stringify({
      tenant_id: args.participant.tenant_id,
      event_id: args.participant.event_id,
      participant_id: args.participant.participant_id,
      qr_token: args.participant.qr_token,
    });
    qrPng = Buffer.from(
      await QRCode.toBuffer(payload, {
        width: 400,
        margin: 2,
        type: "png",
        errorCorrectionLevel: "M",
      }),
    );
  }

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    margin: 24,
    size: [w, h],
    info: {
      Title: `Label ${args.participant.participant_id}`,
    },
  });
  doc.on("data", (c: Buffer) => chunks.push(c));

  const name =
    args.participant.full_name?.trim() ||
    [args.participant.first_name, args.participant.last_name].filter(Boolean).join(" ");

  doc.fontSize(18).text(args.event.title, { align: "center", width: w - 48 });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor("#333").text(`${args.event.date}`, { align: "center" });
  if (args.event.location_name || args.event.location_address) {
    doc.fontSize(10).fillColor("#555").text([args.event.location_name, args.event.location_address].filter(Boolean).join(" — "), {
      align: "center",
    });
  }
  doc.moveDown(1);
  doc.fontSize(16).fillColor("#000").text(name || "Participant", { align: "center" });

  const badgeText = args.badge ?? "General";
  doc.moveDown(0.5).fontSize(11).fillColor("#666").text(badgeText, { align: "center" });

  if (qrPng.length > 0) {
    doc.image(qrPng, w / 2 - 72, doc.y + 12, {
      fit: [144, 144],
      align: "center",
    });
    doc.moveDown(8);
  }

  if (args.tenantName?.trim()) {
    doc.moveDown(0.5).fontSize(9).fillColor("#777").text(args.tenantName.trim(), {
      align: "center",
    });
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}
