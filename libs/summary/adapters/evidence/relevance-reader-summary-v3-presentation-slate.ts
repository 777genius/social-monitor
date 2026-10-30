import {
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
  type ReaderPostPromotionV3Selection,
} from "../../domain/policies/reader-post-promotion-v3";
import {
  READER_PROMOTION_LIMITS,
  compareRankedReaderPromotion,
  readerPromotionOrderKey,
} from "../../domain/policies/reader-promotion-ranking";

const unresolved = (candidate: ReaderPostPromotionV3Candidate): boolean =>
  candidate.presentation.status === "pending" ||
  candidate.presentation.status === "budget_exhausted";

const optimistically = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): ReaderPostPromotionV3Candidate[] => candidates.map((candidate) =>
  unresolved(candidate) ? { ...candidate, presentation: {
    status: "available" as const, presentationInputDigest: "0".repeat(64),
  } } : candidate);

const published = (selection: ReaderPostPromotionV3Selection) =>
  [...selection.top, ...selection.additional, ...selection.news];

/** Pending availability is a planning bound, never a publication result. */
export const planWorkspacePresentationSlate = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): {
  readonly needed: ReadonlySet<string>;
  readonly settled: boolean;
  /**
   * Attempt order assuming every pending headline succeeds: ranked posts by
   * the Top comparator and news by the news comparator, interleaved by their
   * relative position in each block so neither block starves the other.
   * Candidates outside the optimistic board sort last.
   */
  readonly priority: (candidateId: string) => number;
} => {
  const unresolvedIds = new Set(candidates.filter(unresolved)
    .map((candidate) => candidate.candidateId));
  const actual = selectReaderPostPromotionsV3(candidates);
  const optimistic = selectReaderPostPromotionsV3(optimistically(candidates));
  const orderedIds = (selection: ReaderPostPromotionV3Selection): string =>
    JSON.stringify([selection.top, selection.additional, selection.news]
      .map((block) => block.map((candidate) => candidate.candidateId)));
  // Without a per-network cap, only posts the optimistic board would show
  // can change it; every other unresolved headline stays unattempted.
  const needed = new Set(published(optimistic)
    .filter((candidate) => unresolvedIds.has(candidate.candidateId))
    .map((candidate) => candidate.candidateId));
  const share = new Map<string, number>();
  [...optimistic.top, ...optimistic.additional].sort((left, right) =>
    compareRankedReaderPromotion(readerPromotionOrderKey(left), readerPromotionOrderKey(right)))
    .forEach((candidate, index) => share.set(candidate.candidateId,
      index / READER_PROMOTION_LIMITS.rankedTotal));
  optimistic.news.forEach((candidate, index) => share.set(candidate.candidateId,
    index / READER_PROMOTION_LIMITS.news));
  return {
    needed,
    priority: (candidateId) => share.get(candidateId) ?? Number.POSITIVE_INFINITY,
    settled: actual.outcome === optimistic.outcome &&
      orderedIds(actual) === orderedIds(optimistic),
  };
};
