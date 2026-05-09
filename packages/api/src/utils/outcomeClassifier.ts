import type { CallOutcome } from "../types/callLog";

export type ElevenLabsAnalysisShape = {
  call_successful?: boolean | string;
  transcript_summary?: string;
};

export function classifyCallOutcome(input: {
  transcriptSummary?: string;
  analysis?: ElevenLabsAnalysisShape;
  terminationReason?: string;
}): CallOutcome {
  const summary = (input.transcriptSummary ?? "").toLowerCase();
  const term = (input.terminationReason ?? "").toLowerCase();
  const cs = input.analysis?.call_successful;

  if (term.includes("voicemail") || summary.includes("voicemail")) {
    return "voicemail";
  }
  if (term.includes("no_answer") || term.includes("no answer") || summary.includes("no answer")) {
    return "no_answer";
  }
  if (summary.includes("wrong number") || summary.includes("número equivocado")) {
    return "wrong_number";
  }
  if (
    summary.includes("human") ||
    summary.includes("needs_human_followup") ||
    summary.includes("derivar") ||
    summary.includes("supervisor")
  ) {
    return "needs_human_followup";
  }

  if (typeof cs === "boolean") {
    return cs ? inferFromSummary(summary) : inferNegative(summary);
  }
  if (typeof cs === "string") {
    const v = cs.toLowerCase();
    if (v.includes("success")) return inferFromSummary(summary);
    if (v.includes("fail")) return inferNegative(summary);
  }

  return inferFromSummary(summary);
}

function inferNegative(summary: string): CallOutcome {
  if (summary.includes("cancel")) return "cancelled";
  return "no_answer";
}

function inferFromSummary(summary: string): CallOutcome {
  if (summary.includes("confirm") || summary.includes("asistirá") || summary.includes("yes")) {
    return "confirmed";
  }
  if (
    summary.includes("cancel") ||
    summary.includes("cancelar") ||
    summary.includes("won't") ||
    summary.includes("no puede")
  ) {
    return "cancelled";
  }
  if (summary.includes("maybe") || summary.includes("quizás") || summary.includes("tal vez")) {
    return "maybe";
  }
  if (summary.includes("voicemail")) return "voicemail";
  if (summary.includes("wrong number") || summary.includes("equivocado")) return "wrong_number";
  if (summary.includes("human") || summary.includes("seguimiento")) return "needs_human_followup";
  return "maybe";
}
