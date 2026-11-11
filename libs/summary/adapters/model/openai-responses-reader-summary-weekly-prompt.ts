import {
  assertReaderSummaryWeeklyModelInput,
  readerSummaryWeeklyModelOutputSchemaVersion,
  type ReaderSummaryWeeklyModelInput,
} from "../../ports/reader-summary-weekly-model.port";
import { buildWeeklyPromptCertificationContract } from "./openai-responses-reader-summary-weekly-certification-contract";

import { buildOpenAiReaderSummaryWeeklyUntrustedEvidenceData } from "./openai-responses-reader-summary-weekly-untrusted-evidence";

export const currentReaderSummaryWeeklyPromptRelease = Object.freeze({
  id: "reader_summary.weekly_prompt.2026-10-24.v9",
  releasedOn: "2026-10-24",
  schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
  changeSummary:
    "Pins the exact output key and section shapes and the one-lead-section rule, discloses the enforced claim-language vocabulary and measured-delta phrasing, reinforces provider-balanced story selection, and caps single-day sections.",
});

export { buildOpenAiReaderSummaryWeeklyInstructions } from "./openai-responses-reader-summary-weekly-instructions";

export const buildOpenAiReaderSummaryWeeklyPromptPayload = (
  input: ReaderSummaryWeeklyModelInput,
): string => {
  assertReaderSummaryWeeklyModelInput(input);
  return JSON.stringify({
    contract: buildWeeklyPromptCertificationContract(input),
    untrustedEvidenceData: buildOpenAiReaderSummaryWeeklyUntrustedEvidenceData(input),
  });
};
