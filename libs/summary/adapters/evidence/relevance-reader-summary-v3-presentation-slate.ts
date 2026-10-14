import {
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
  type ReaderPostPromotionV3Selection,
} from "../../domain/policies/reader-post-promotion-v3";

/** Pending availability is a planning bound, never a publication result. */
export const planWorkspacePresentationSlate = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
): { readonly needed: ReadonlySet<string>; readonly settled: boolean } => {
  const unresolved = (candidate: ReaderPostPromotionV3Candidate): boolean =>
    candidate.presentation.status === "pending" ||
    candidate.presentation.status === "budget_exhausted";
  const unresolvedIds = new Set(candidates.filter(unresolved)
    .map((candidate) => candidate.candidateId));
  const actual = selectReaderPostPromotionsV3(candidates);
  const optimistic = selectReaderPostPromotionsV3(candidates.map((candidate) =>
    unresolved(candidate) ? { ...candidate, presentation: {
      status: "available" as const, presentationInputDigest: "0".repeat(64),
    } } : candidate));
  const orderedIds = (selection: ReaderPostPromotionV3Selection): string =>
    JSON.stringify([selection.top.map((candidate) => candidate.candidateId),
      selection.additional.map((candidate) => candidate.candidateId)]);
  const representativeIds = (selection: ReaderPostPromotionV3Selection): Set<string> =>
    new Set([...selection.top, ...selection.additional].map((candidate) =>
      candidate.candidateId).concat(selection.excluded.filter((entry) =>
      entry.reason === "capacity_exhausted" || entry.reason === "top_provider_cap")
      .map((entry) => entry.candidateId)));
  const actualRepresentatives = representativeIds(actual);
  const availableFamilies = new Set(candidates.filter((candidate) =>
    actualRepresentatives.has(candidate.candidateId)).map((candidate) =>
    candidate.providerFamily));
  const optimisticRepresentatives = representativeIds(optimistic);
  const needed = new Set([...optimistic.top, ...optimistic.additional]
    .filter((candidate) => unresolvedIds.has(candidate.candidateId))
    .map((candidate) => candidate.candidateId));
  // Even a low-ranked new provider can change the Top diversity cap. Establish
  // its real availability before treating remaining lower-ranked rows as settled.
  const requestedFamilies = new Set(availableFamilies);
  for (const candidate of candidates) {
    if (optimisticRepresentatives.has(candidate.candidateId) &&
        !requestedFamilies.has(candidate.providerFamily)) {
      requestedFamilies.add(candidate.providerFamily);
      needed.add(candidate.candidateId);
    }
  }
  return {
    needed,
    settled: actual.outcome === optimistic.outcome &&
      orderedIds(actual) === orderedIds(optimistic) &&
      requestedFamilies.size === availableFamilies.size,
  };
};
