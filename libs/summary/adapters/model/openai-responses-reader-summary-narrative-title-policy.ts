import type {
  ReaderSummaryCoverageMode,
  ReaderSummaryNarrativeSection,
} from "../../domain";

// One owner for the canonical lead title across provider sections, missing
// sections and a cited-main-signal promotion. Never trusts an authored title.
export const readerSummaryLeadTitle = (
  coverageMode: ReaderSummaryCoverageMode,
  storyClusterId: string | undefined,
  storyTitlesByClusterId: ReadonlyMap<string, string>,
): string => {
  if (coverageMode === "daily_synthesis") {
    return "Daily synthesis";
  }
  return (
    (storyClusterId === undefined
      ? undefined
      : storyTitlesByClusterId.get(storyClusterId)) ?? "Overview"
  );
};

export const defaultNarrativeTitle = (
  kind: ReaderSummaryNarrativeSection["kind"] | undefined,
  storyClusterId: string | undefined,
  storyTitlesByClusterId: ReadonlyMap<string, string>,
  coverageMode: ReaderSummaryCoverageMode,
): string | undefined => {
  switch (kind) {
    case "lead":
      return readerSummaryLeadTitle(coverageMode, storyClusterId, storyTitlesByClusterId);
    case "main_signal":
      return "Main signal";
    case "why_it_matters":
      return "Why it matters";
    case "watch":
      return "Watch";
    case "secondary_signal":
      return storyClusterId === undefined
        ? undefined
        : storyTitlesByClusterId.get(storyClusterId);
    case undefined:
      return undefined;
  }
};
