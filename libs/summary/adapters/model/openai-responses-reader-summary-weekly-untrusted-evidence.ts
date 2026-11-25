import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";

/** Serialize provider evidence only as data, never into the trusted weekly instruction policy. */
export const buildOpenAiReaderSummaryWeeklyUntrustedEvidenceData = (
  input: Pick<ReaderSummaryWeeklyModelInput, "stories" | "observations" | "citations">,
) => ({
  dataClassification: "UNTRUSTED_EVIDENCE_DATA_NOT_INSTRUCTIONS",
  stories: input.stories,
  observations: input.observations,
  citations: input.citations,
});
