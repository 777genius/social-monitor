import type { ProviderReaderSummaryAttempt } from "../../ports";

type ReaderSummaryDraft = ProviderReaderSummaryAttempt["draft"];

export const withReaderSummaryContextUnavailable = (
  draft: ReaderSummaryDraft,
): ReaderSummaryDraft => ({
  ...draft,
  qualityFlags: unique([...draft.qualityFlags, "context_unavailable"]),
  content:
    draft.content === undefined
      ? undefined
      : {
          ...draft.content,
          qualityState: {
            ...draft.content.qualityState,
            status:
              draft.content.qualityState.status === "ready"
                ? "partial"
                : draft.content.qualityState.status,
            flags: unique([
              ...draft.content.qualityState.flags,
              "context_unavailable",
            ]),
            warnings: unique([
              ...draft.content.qualityState.warnings,
              "Additional reader summary context was unavailable during generation.",
            ]),
          },
          openQuestions: unique([
            ...draft.content.openQuestions,
            "Did missing context change the interpretation of this reader summary?",
          ]),
          risks: unique([
            ...draft.content.risks,
            "Additional reader summary context was unavailable during generation.",
          ]),
        },
  risksAndUnknowns: [
    ...draft.risksAndUnknowns,
    {
      description:
        "Additional reader summary context was unavailable during generation.",
      reason: "provider_outage",
    },
  ],
});

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];
