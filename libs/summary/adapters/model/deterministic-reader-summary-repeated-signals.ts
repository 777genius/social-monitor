import type { ReaderSummaryModelInput } from "../../ports";
import { citationIdForDeterministicReaderEvidence } from "./deterministic-reader-summary-citation-index";

// Cross-interest recurrence is independent of top-story ranking and input order.
export const projectRepeatedReaderSummarySignals = (
  clusters: ReaderSummaryModelInput["evidence"]["clusters"],
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  firstItem: ReaderSummaryModelInput["evidence"]["selectedEvidence"][number],
  citationIdsByFeedItemId: ReadonlyMap<string, string>,
) =>
  clusters
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
    });
