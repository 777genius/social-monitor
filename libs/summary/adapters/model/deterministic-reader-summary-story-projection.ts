import {
  citationIdForDeterministicReaderEvidence,
  indexDeterministicReaderSummaryCitations,
} from "./deterministic-reader-summary-citation-index";
import type { ProviderReaderSummaryAttempt, ReaderSummaryModelInput } from "../../ports";

export const buildStorySummary = (
  title: string,
  interestIds: readonly string[],
  providerKeys: readonly string[],
): string =>
  `${title} appeared across ${interestIds.length} interest(s) and ${providerKeys.length} provider(s).`;

const buildInterestHighlightsWithIndex = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationIdsByFeedItemId: ReadonlyMap<string, string>,
) => {
  const firstByInterest = new Map<
    string,
    ReaderSummaryModelInput["evidence"]["selectedEvidence"][number]
  >();
  for (const item of selectedEvidence) {
    if (!firstByInterest.has(item.interestId)) {
      firstByInterest.set(item.interestId, item);
    }
  }

  return [...firstByInterest.entries()]
    .slice(0, 8)
    .map(([interestId, item]) => ({
      interestId,
      title: item.title,
      summary: item.whyImportant[0] ?? "Selected as a relevant summary signal.",
      citationIds: [
        citationIdForDeterministicReaderEvidence(citationIdsByFeedItemId, item.feedItemId),
      ],
    }));
};

// Preserve the original public helper contract for existing deterministic consumers.
export const buildInterestHighlights = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationMap: ProviderReaderSummaryAttempt["draft"]["citationMap"],
) => buildInterestHighlightsWithIndex(
  selectedEvidence,
  indexDeterministicReaderSummaryCitations(citationMap),
);

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
    ? input.evidence.clusters
        .filter((cluster) => cluster.interestIds.length >= 2)
        .slice(0, 5)
        .map((cluster) => {
          const representative =
            selectedEvidence.find(
              (item) => item.feedItemId === cluster.representativeFeedItemId,
            ) ?? firstItem;
          const citationId = citationIdForDeterministicReaderEvidence(
            citationIdsByFeedItemId, representative.feedItemId,
          );

          return {
            storyClusterId: cluster.id,
            title: representative.title,
            interestIds: cluster.interestIds,
            citationIds: [citationId],
          };
        })
    : [];

  return { citationMap, topStories, interestHighlights, repeatedSignals };
};
