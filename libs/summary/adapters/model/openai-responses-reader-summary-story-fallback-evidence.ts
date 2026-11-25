import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { firstNonEmptyString, uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";
import { maximumTopStoryCitationCount } from "./openai-responses-reader-summary-story-citations";
type SelectedEvidenceItem = ReaderSummaryModelInput["evidence"]["selectedEvidence"][number];

// Only trusted selected evidence is eligible to produce a citable fallback.
export const fallbackTopStories = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const citationByFeedItemId = new Map(
    citationMap.map((citation) => [citation.feedItemId, citation] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.evidence.selectedEvidence.map(
      (item) => [item.feedItemId, item] as const,
    ),
  );

  return input.evidence.clusters
    .flatMap((cluster): readonly ReaderSummaryTopStory[] => {
      const feedItemIds = [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ];
      const citationIds = feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId)?.citationId)
        .filter((citationId): citationId is string => citationId !== undefined);
      const evidence = feedItemIds
        .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
        .filter((item): item is SelectedEvidenceItem => item !== undefined);
      const leadEvidence = evidence[0];
      if (citationIds.length === 0 || leadEvidence === undefined) {
        return [];
      }

      return [
        {
          storyClusterId: cluster.id,
          title: leadEvidence.title,
          summary: firstNonEmptyString(
            leadEvidence.bodyPreview,
            cluster.whyImportant[0],
            leadEvidence.title,
          ),
          readerReasonProvenance: { kind: "normalizer_fallback" },
          interestIds: uniqueNonEmptyStrings([
            ...cluster.interestIds,
            leadEvidence.interestId,
          ]),
          providerKeys: uniqueNonEmptyStrings([
            ...cluster.providerKeys,
            leadEvidence.providerKey,
          ]),
          citationIds: uniqueNonEmptyStrings(citationIds).slice(
            0,
            maximumTopStoryCitationCount,
          ),
        },
      ];
    })
    .slice(
      0,
      input.evidence.editorialSlate?.top.length ?? input.policy.maxStories,
    );
};
