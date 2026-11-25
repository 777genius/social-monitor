import type { ReaderSummaryCoveragePlanItem } from "../../domain";
import type { ProviderReaderSummaryAttempt, ReaderSummaryModelInput } from "../../ports";
import { selectProviderDiversePlanCitations } from "./deterministic-reader-summary-provider-citation-policy";

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

export const uniqueNarrativeCitationIds = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values.filter(
      (value): value is string => value !== undefined && value.length > 0,
    ),
  ),
];
