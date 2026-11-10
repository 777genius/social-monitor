import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ProviderReaderSummaryAttempt, ReaderSummaryModelInput } from "../../ports";

type ReaderSummaryDraftCitation =
  ProviderReaderSummaryAttempt["draft"]["citationMap"][number];

/**
 * Evidence citation allocation is independent from the narrative's copy.
 * The daily path favors provider diversity; single-story mode retains all
 * known citations in feed order. No model output is trusted to supply IDs.
 */
export const selectDeterministicNarrativeCitations = (params: {
  readonly mode: ReaderSummaryModelInput["coveragePlan"]["mode"];
  readonly lead: ReaderSummaryCoveragePlanItem;
  readonly secondary: readonly ReaderSummaryCoveragePlanItem[];
  readonly citationMap: readonly ReaderSummaryDraftCitation[];
}): {
  readonly leadCitationIds: readonly string[];
  readonly dailySynthesisCitations: ReadonlyMap<string, ReaderSummaryDraftCitation>;
} => {
  const citationsByFeedItemId = groupCitationsByFeedItemId(params.citationMap);
  const dailySynthesisCitations =
    params.mode === "daily_synthesis"
      ? selectProviderDiversePlanCitations(
          [params.lead, ...params.secondary],
          citationsByFeedItemId,
        )
      : new Map<string, ReaderSummaryDraftCitation>();
  const leadCitationIds =
    params.mode === "daily_synthesis"
      ? [...dailySynthesisCitations.values()].map(
          (citation) => citation.citationId,
        )
      : citationIdsFor(params.lead, citationsByFeedItemId);
  return { leadCitationIds, dailySynthesisCitations };
};

const groupCitationsByFeedItemId = (
  citations: readonly ReaderSummaryDraftCitation[],
): ReadonlyMap<string, readonly ReaderSummaryDraftCitation[]> => {
  const grouped = new Map<string, ReaderSummaryDraftCitation[]>();
  for (const citation of citations) {
    const feedItemCitations = grouped.get(citation.feedItemId) ?? [];
    feedItemCitations.push(citation);
    grouped.set(citation.feedItemId, feedItemCitations);
  }
  return grouped;
};

const citationIdsFor = (
  item: ReaderSummaryCoveragePlanItem,
  citationsByFeedItemId: ReadonlyMap<
    string,
    readonly ReaderSummaryDraftCitation[]
  >,
): readonly string[] =>
  uniqueNarrativeCitationIds(
    item.feedItemIds.flatMap((feedItemId) =>
      (citationsByFeedItemId.get(feedItemId) ?? []).map(
        (citation) => citation.citationId,
      ),
    ),
  );

const selectProviderDiversePlanCitations = (
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

export const uniqueNarrativeCitationIds = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values.filter(
      (value): value is string => value !== undefined && value.length > 0,
    ),
  ),
];
