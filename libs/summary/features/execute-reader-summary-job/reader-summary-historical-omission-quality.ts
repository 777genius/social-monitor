import type { ProviderReaderSummaryAttempt } from "../../ports";
import type { ReaderSummaryHistoricalGitHubOmission } from "./reader-summary-prepublication-gate";

type ReaderSummaryDraft = ProviderReaderSummaryAttempt["draft"];

export const withReaderSummaryHistoricalOmissionQuality = (
  draft: ReaderSummaryDraft,
  omission: ReaderSummaryHistoricalGitHubOmission | undefined,
): ReaderSummaryDraft =>
  omission?.readerQuality === undefined
    ? draft
    : {
        ...draft,
        qualityFlags: [
          ...draft.qualityFlags.filter((flag) => flag !== "limited_sources"),
          omission.readerQuality,
        ],
      };
