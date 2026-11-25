import type { ReaderSummaryModelInput } from "../../ports";

type SelectedEvidence = ReaderSummaryModelInput["evidence"]["selectedEvidence"];

/** Pure provider-coverage replacement; ranking and pagination are separate. */
export const rebalanceReaderSummaryProviderCoverage = (
  evidence: SelectedEvidence,
  firstPage: SelectedEvidence,
): SelectedEvidence => {
  const selected = [...firstPage];
  const selectedFeedItemIds = new Set(
    selected.map((item) => item.feedItemId),
  );
  const selectedProviderCounts = providerCounts(selected);
  const missingProviderRepresentatives = firstByProvider(evidence).filter(
    (item) => !selectedProviderCounts.has(item.providerKey),
  );

  for (const representative of missingProviderRepresentatives) {
    const replacementIndex = lastReplaceableProviderIndex(
      selected,
      selectedProviderCounts,
    );
    if (
      replacementIndex === undefined ||
      selectedFeedItemIds.has(representative.feedItemId)
    ) {
      continue;
    }

    const replaced = selected[replacementIndex];
    if (replaced === undefined) {
      continue;
    }

    selected[replacementIndex] = representative;
    selectedFeedItemIds.delete(replaced.feedItemId);
    selectedFeedItemIds.add(representative.feedItemId);
    decrementProviderCount(selectedProviderCounts, replaced.providerKey);
    selectedProviderCounts.set(representative.providerKey, 1);
  }

  return selected;
};

const providerCounts = (evidence: SelectedEvidence): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const item of evidence) {
    counts.set(item.providerKey, (counts.get(item.providerKey) ?? 0) + 1);
  }

  return counts;
};

const firstByProvider = (evidence: SelectedEvidence): SelectedEvidence => {
  const seen = new Set<string>();
  const result: SelectedEvidence[number][] = [];

  for (const item of evidence) {
    if (seen.has(item.providerKey)) {
      continue;
    }
    seen.add(item.providerKey);
    result.push(item);
  }

  return result;
};

const lastReplaceableProviderIndex = (
  selected: SelectedEvidence,
  counts: ReadonlyMap<string, number>,
): number | undefined => {
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const item = selected[index];
    if (item !== undefined && (counts.get(item.providerKey) ?? 0) > 1) {
      return index;
    }
  }

  return undefined;
};

const decrementProviderCount = (
  counts: Map<string, number>,
  providerKey: string,
): void => {
  const nextCount = (counts.get(providerKey) ?? 0) - 1;
  if (nextCount <= 0) {
    counts.delete(providerKey);
    return;
  }
  counts.set(providerKey, nextCount);
};
