import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";

type ReaderSummaryDraftCitation =
  ProviderReaderSummaryAttempt["draft"]["citationMap"][number];

/** Select a trusted citation per cluster, minimizing provider duplication. */
export const selectProviderDiversePlanCitations = (
  items: readonly ReaderSummaryCoveragePlanItem[],
  citationsByFeedItemId: ReadonlyMap<
    string,
    readonly ReaderSummaryDraftCitation[]
  >,
): ReadonlyMap<string, ReaderSummaryDraftCitation> => {
  const selectedByClusterId = new Map<string, ReaderSummaryDraftCitation>();
  const selectedProviderKeys = new Set<string>();
  const citationsByClusterId = new Map(
    items.map((item) => [
      item.clusterId,
      item.feedItemIds.flatMap(
        (feedItemId) => citationsByFeedItemId.get(feedItemId) ?? [],
      ),
    ]),
  );
  const providerAvailability = new Map<string, number>();
  for (const citations of citationsByClusterId.values()) {
    for (const providerKey of new Set(
      citations.map((citation) => citation.providerKey),
    )) {
      providerAvailability.set(
        providerKey,
        (providerAvailability.get(providerKey) ?? 0) + 1,
      );
    }
  }

  for (const item of items) {
    const citations = citationsByClusterId.get(item.clusterId) ?? [];
    const selected = citations
      .map((citation, index) => ({ citation, index }))
      .sort(
        (left, right) =>
          Number(selectedProviderKeys.has(left.citation.providerKey)) -
            Number(selectedProviderKeys.has(right.citation.providerKey)) ||
          (providerAvailability.get(left.citation.providerKey) ?? 0) -
            (providerAvailability.get(right.citation.providerKey) ?? 0) ||
          left.index - right.index,
      )[0]?.citation;
    if (selected === undefined) {
      continue;
    }
    selectedByClusterId.set(item.clusterId, selected);
    selectedProviderKeys.add(selected.providerKey);
  }

  return selectedByClusterId;
};
