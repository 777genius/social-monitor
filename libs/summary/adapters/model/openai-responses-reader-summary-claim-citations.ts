import { asRecord } from "./openai-responses-reader-summary-json";

/** Reject explicitly empty claim citations before any editorial/evidence normalization. */
export const assertOpenAiReaderSummaryClaimCitationIds = (
  raw: Record<string, unknown>,
): void => {
  assertNonEmptyClaimCitationIds(raw.topStories, "topStory");
  assertNonEmptyClaimCitationIds(raw.interestHighlights, "interestHighlight");
  assertNonEmptyClaimCitationIds(raw.repeatedSignals, "repeatedSignal");
  assertNonEmptyClaimCitationIds(
    asRecord(raw.content)?.claimBoard,
    "readerClaim",
  );
};

const assertNonEmptyClaimCitationIds = (
  entries: unknown,
  surface: string,
): void => {
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    const record = asRecord(entry);
    if (Array.isArray(record?.citationIds) && record.citationIds.length === 0) {
      throw new Error(`${surface} citationIds must not be empty`);
    }
  }
};
