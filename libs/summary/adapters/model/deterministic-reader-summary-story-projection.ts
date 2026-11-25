import {
  citationIdForDeterministicReaderEvidence,
  indexDeterministicReaderSummaryCitations,
} from "./deterministic-reader-summary-citation-index";
import type { ReaderSummaryModelInput } from "../../ports";
import { buildInterestHighlightsWithIndex } from "./deterministic-reader-summary-interest-highlights";
import { projectRepeatedReaderSummarySignals } from "./deterministic-reader-summary-repeated-signals";

export const buildStorySummary = (
  title: string,
  interestIds: readonly string[],
  providerKeys: readonly string[],
): string =>
  `${title} appeared across ${interestIds.length} interest(s) and ${providerKeys.length} provider(s).`;

export { buildInterestHighlights } from "./deterministic-reader-summary-interest-highlights";

/**
 * Project citation-bound reader stories without owning ranking, editorial-slate
 * selection, publication or model lifecycle. Citation IDs retain the order of
 * the full cited evidence, not the subset selected for the first page.
 */
export const buildDeterministicReaderSummaryStoryProjection = ({
  input,
  citedEvidence,
  selectedEvidence,
  topStoryClusters,
  firstItem,
}: {
  readonly input: ReaderSummaryModelInput;
  readonly citedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  readonly selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"];
  readonly topStoryClusters: ReaderSummaryModelInput["evidence"]["clusters"];
  readonly firstItem: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number];
}) => {
  const citationMap = citedEvidence.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: "title" as const,
    canonicalUrl: item.canonicalUrl,
  }));
  const citationIdsByFeedItemId = indexDeterministicReaderSummaryCitations(citationMap);
  const topStories = topStoryClusters.map((cluster, index) => {
    const representative =
      selectedEvidence.find(
        (item) => item.feedItemId === cluster.representativeFeedItemId,
      ) ??
      selectedEvidence[index] ??
      firstItem;
    const citationId = citationIdForDeterministicReaderEvidence(
      citationIdsByFeedItemId, representative.feedItemId,
    );

    return {
      storyClusterId: cluster.id,
      title: representative.title,
      summary: buildStorySummary(
        representative.title,
        cluster.interestIds,
        cluster.providerKeys,
      ),
      interestIds: cluster.interestIds,
      providerKeys: cluster.providerKeys,
      citationIds: [citationId],
    };
  });
  const interestHighlights = input.policy.includeInterestHighlights
    ? buildInterestHighlightsWithIndex(selectedEvidence, citationIdsByFeedItemId)
    : [];
  const repeatedSignals = input.policy.includeRepeatedSignals
    ? projectRepeatedReaderSummarySignals(
        input.evidence.clusters,
        selectedEvidence,
        firstItem,
        citationIdsByFeedItemId,
      )
    : [];

  return { citationMap, topStories, interestHighlights, repeatedSignals };
};
