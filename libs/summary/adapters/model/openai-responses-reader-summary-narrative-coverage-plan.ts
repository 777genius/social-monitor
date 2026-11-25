import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import type { ReaderSummaryNarrativeCoverage } from "./openai-responses-reader-summary-narrative-citation-policy";
import { citationIdsForPlannedFeedItems } from "./openai-responses-reader-summary-narrative-coverage-citation-index";

/** Derive lead and secondary trust policy exclusively from the approved plan. */
export const buildReaderSummaryNarrativeCoverage = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryNarrativeCoverage => {
  const citationIdsFor = citationIdsForPlannedFeedItems(citationMap);
  const plan = input.coveragePlan;
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
