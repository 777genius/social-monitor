import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";
import { readerSummaryIndependentProviderFamily } from
  "../../domain/value-objects/reader-summary-provider-identity";

export const crossProviderReserveIds = (
  selection: SummaryEvidenceSelection,
): ReadonlySet<string> => {
  const result = new Set<string>();
  for (const cluster of selection.clusters) {
    if (new Set(cluster.providerKeys.map((providerKey) =>
      readerSummaryIndependentProviderFamily({ providerKey }))).size < 2) {
      continue;
    }
    const clusterIds = new Set([
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]);
    for (const item of selection.selectedEvidence) {
      if (clusterIds.has(item.feedItemId)) {
        result.add(item.feedItemId);
      }
    }
  }
  return result;
};

export const topReadCandidateReserveProviders = [
  "x-twitter",
  "reddit",
] as const;

export const topReadCandidateSupplementTargetForLimit = (
  limit: number,
): number => {
  if (limit >= 80) {
    return 10;
  }

  if (limit >= 40) {
    return 6;
  }

  return 3;
};

export const countTopReadEligibleItemsForProvider = (
  items: Iterable<SummaryEvidenceItem>,
  providerKey: string,
): number => {
  let count = 0;

  for (const item of items) {
    if (item.providerKey === providerKey && isTopReadEligibleEvidence(item)) {
      count += 1;
    }
  }

  return count;
};

export const promoteTopReadCandidatesWithinProviders = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const rankedByProvider = new Map<string, SummaryEvidenceItem[]>();
  for (const item of items) {
    rankedByProvider.set(item.providerKey, [
      ...(rankedByProvider.get(item.providerKey) ?? []),
      item,
    ]);
  }

  for (const [providerKey, providerItems] of rankedByProvider.entries()) {
    rankedByProvider.set(
      providerKey,
      [...providerItems].sort(compareTopReadFit),
    );
  }

  return items.map(
    (item) => rankedByProvider.get(item.providerKey)?.shift() ?? item,
  );
};

const compareTopReadFit = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const eligibilityDiff =
    Number(isTopReadEligibleEvidence(right)) -
    Number(isTopReadEligibleEvidence(left));
  if (eligibilityDiff !== 0) {
    return eligibilityDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAt.getTime() - left.observedAt.getTime();
};
