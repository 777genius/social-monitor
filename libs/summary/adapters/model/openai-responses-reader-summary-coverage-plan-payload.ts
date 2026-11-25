import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

// Only project the approved coverage plan into model-visible citation IDs.
// Evidence admission, ordering and fallback belong to their existing owners.
export const buildReaderSummaryCoveragePlanPromptPayload = (
  coveragePlan: ReaderSummaryModelInput["coveragePlan"],
  citationIdByFeedItemId: ReadonlyMap<string, string>,
) => ({
  mode: coveragePlan.mode,
  lead:
    coveragePlan.lead === undefined
      ? null
      : promptCoverageItem(coveragePlan.lead, citationIdByFeedItemId),
  secondary: coveragePlan.secondary.map((item) =>
    promptCoverageItem(item, citationIdByFeedItemId),
  ),
});

const promptCoverageItem = (
  item: ReaderSummaryCoveragePlanItem,
  citationIdByFeedItemId: ReadonlyMap<string, string>,
) => ({
  role: item.role,
  storyClusterId: item.clusterId,
  score: item.score,
  citationIds: item.feedItemIds
    .map((feedItemId) => citationIdByFeedItemId.get(feedItemId))
    .filter((id): id is string => id !== undefined),
  providerKeys: item.providerKeys,
  interestIds: item.interestIds,
  whyImportant: item.whyImportant,
});
