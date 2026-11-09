import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-citation-policy";

// Preserve the historical direct-import surface for narrative consumers.
export type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-citation-policy";
export {
  isValidReaderSummaryNarrativeLead,
  buildReaderSummaryNarrativeCitationGuard,
} from "./openai-responses-reader-summary-narrative-citation-policy";

export const buildReaderSummaryNarrativeCoverage = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryNarrativeCoverage => {
  const citationByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const plan = input.coveragePlan;
  const citationIdsFor = (feedItemIds: readonly string[]) =>
    new Set(
      feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId))
        .filter((id): id is string => id !== undefined),
    );
  const leadCitationIds = citationIdsFor(plan.lead?.feedItemIds ?? []);
  const secondaryCitationIds = new Map(
    plan.secondary.map((item) => [
      item.clusterId,
      citationIdsFor(item.feedItemIds),
    ]),
  );
  const allowedNarrativeCitationIds = new Set([
    ...leadCitationIds,
    ...[...secondaryCitationIds.values()].flatMap((ids) => [...ids]),
  ]);

  return {
    mode: plan.mode,
    leadClusterId: plan.lead?.clusterId,
    leadCitationIds,
    allowedLeadCitationIds:
      plan.mode === "daily_synthesis"
        ? allowedNarrativeCitationIds
        : leadCitationIds,
    allowedNarrativeCitationIds,
    secondaryCitationIds,
  };
};
