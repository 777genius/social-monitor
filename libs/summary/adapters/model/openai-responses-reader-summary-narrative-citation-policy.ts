import type {
  ReaderSummaryCoverageMode,
  ReaderSummaryNarrativeSection,
} from "../../domain";

// Trust policy for model-provided section citations; coverage projection stays in
// the separate coverage-plan adapter.
export type ReaderSummaryNarrativeCoverage = {
  readonly mode: ReaderSummaryCoverageMode;
  readonly leadClusterId: string | undefined;
  readonly leadCitationIds: ReadonlySet<string>;
  readonly allowedLeadCitationIds: ReadonlySet<string>;
  readonly allowedNarrativeCitationIds: ReadonlySet<string>;
  readonly secondaryCitationIds: ReadonlyMap<string, ReadonlySet<string>>;
};

export const isValidReaderSummaryNarrativeLead = (
  citationIds: readonly string[],
  coverage: ReaderSummaryNarrativeCoverage,
): boolean => {
  if (
    citationIds.length === 0 ||
    !citationIds.every((id) => coverage.allowedLeadCitationIds.has(id))
  ) {
    return false;
  }
  if (coverage.mode === "single_story") {
    return citationIds.every((id) => coverage.leadCitationIds.has(id));
  }

  return (
    citationIds.some((id) => coverage.leadCitationIds.has(id)) &&
    [...coverage.secondaryCitationIds.values()].some((allowed) =>
      citationIds.some((id) => allowed.has(id)),
    )
  );
};

export const buildReaderSummaryNarrativeCitationGuard =
  (
    coverage: ReaderSummaryNarrativeCoverage,
    eligibleWatchCitationIds: ReadonlySet<string>,
  ): ((
    kind: ReaderSummaryNarrativeSection["kind"] | undefined,
    citationIds: readonly string[],
  ) => boolean) =>
  (kind, citationIds) => {
    if (kind === "watch") {
      return citationIds.every((id) => eligibleWatchCitationIds.has(id));
    }
    if (kind === "main_signal" || kind === "why_it_matters") {
      return citationIds.every((id) =>
        coverage.allowedNarrativeCitationIds.has(id),
      );
    }
    return true;
  };
