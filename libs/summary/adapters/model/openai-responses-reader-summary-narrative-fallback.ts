import type { ReaderSummaryCitation, ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { requiredString } from "./openai-responses-reader-summary-json";
import { readerSummaryLeadTitle } from "./openai-responses-reader-summary-narrative-title-policy";
import { plannedFallbackNarrativeCitationIds } from "./openai-responses-reader-summary-fallback-evidence-policy";

// Never synthesize a fallback lead without approved, cited source evidence.
export const fallbackNarrative = (params: {
  readonly legacyExecutiveSummary: string;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyTitlesByClusterId: ReadonlyMap<string, string>;
}): readonly ReaderSummaryNarrativeSection[] => {
  const citationIds = plannedFallbackNarrativeCitationIds(params);
  if (citationIds.length === 0) {
    return [];
  }

  return [
    {
      id: "narrative-1",
      kind: "lead",
      title: readerSummaryLeadTitle(
        params.input.coveragePlan.mode,
        params.input.coveragePlan.lead?.clusterId,
        params.storyTitlesByClusterId,
      ),
      text: requiredString(
        params.legacyExecutiveSummary,
        "reader summary executive summary",
      ),
      citationIds,
      ...(params.input.coveragePlan.mode === "daily_synthesis" ||
      params.input.coveragePlan.lead?.clusterId === undefined
        ? {}
        : { storyClusterId: params.input.coveragePlan.lead.clusterId }),
    },
  ];
};
