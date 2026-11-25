import { rebalanceReaderSummaryProviderCoverage } from "./deterministic-reader-summary-provider-coverage-policy";
import type { ReaderSummaryModelInput } from "../../ports";

type SelectedEvidence = ReaderSummaryModelInput["evidence"]["selectedEvidence"];

export const selectProviderDiverseRankedEvidence = (
  evidence: SelectedEvidence,
  limit: number,
): SelectedEvidence => {
  const normalizedLimit = normalizeReaderSummaryStoryLimit(limit);
  const firstPage = evidence.slice(0, normalizedLimit);

  if (firstPage.length < normalizedLimit) {
    return firstPage;
  }

  const selected = [...rebalanceReaderSummaryProviderCoverage(evidence, firstPage)];

  const originalIndexByFeedItemId = new Map(
    evidence.map((item, index) => [item.feedItemId, index] as const),
  );

  return selected.sort(
    (left, right) =>
      (originalIndexByFeedItemId.get(left.feedItemId) ?? 0) -
      (originalIndexByFeedItemId.get(right.feedItemId) ?? 0),
  );
};

export const normalizeReaderSummaryStoryLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 20);
};
