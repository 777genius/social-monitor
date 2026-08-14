import type {
  ReaderSummaryNarrativeSection,
  ReaderSummaryCoveragePlanItem,
} from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";

type ReaderSummaryDraftCitation =
  ProviderReaderSummaryAttempt["draft"]["citationMap"][number];
type ReaderSummaryDraftTopStory =
  ProviderReaderSummaryAttempt["draft"]["topStories"][number];

export const buildDeterministicReaderSummaryNarrative = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly executiveSummary: string;
  readonly citationMap: readonly ReaderSummaryDraftCitation[];
  readonly topStories: readonly ReaderSummaryDraftTopStory[];
}): readonly ReaderSummaryNarrativeSection[] => {
  const lead = params.input.coveragePlan.lead;
  if (lead === undefined) {
    return [];
  }

  const citationsByFeedItemId = groupCitationsByFeedItemId(params.citationMap);
  const topStoryByClusterId = new Map(
    params.topStories.map((story) => [story.storyClusterId, story] as const),
  );
  const dailySynthesisCitations =
    params.input.coveragePlan.mode === "daily_synthesis"
      ? selectProviderDiversePlanCitations(
          [lead, ...params.input.coveragePlan.secondary],
          citationsByFeedItemId,
        )
      : new Map<string, ReaderSummaryDraftCitation>();
  const leadCitationIds =
    params.input.coveragePlan.mode === "daily_synthesis"
      ? [...dailySynthesisCitations.values()].map(
          (citation) => citation.citationId,
        )
      : citationIdsFor(lead, citationsByFeedItemId);
  const leadStory = topStoryByClusterId.get(lead.clusterId);
  const leadSection: ReaderSummaryNarrativeSection = {
    id: "narrative-deterministic-lead",
    kind: "lead",
    title:
      params.input.coveragePlan.mode === "daily_synthesis"
        ? "Daily synthesis"
        : (leadStory?.title ?? "Main signal"),
    text: params.executiveSummary,
    citationIds: leadCitationIds,
    ...(params.input.coveragePlan.mode === "daily_synthesis"
      ? {}
      : { storyClusterId: lead.clusterId }),
  };
  if (params.input.coveragePlan.mode === "single_story") {
    return [leadSection];
  }

  return [
    leadSection,
    ...params.input.coveragePlan.secondary.map(
      (item, index): ReaderSummaryNarrativeSection => {
        const story = topStoryByClusterId.get(item.clusterId);
        return {
          id: `narrative-deterministic-secondary-${index + 1}`,
          kind: "secondary_signal",
          title: story?.title ?? `Additional monitored signal ${index + 1}`,
          text:
            story?.summary ??
            item.whyImportant[0] ??
            "A distinct monitored signal also appeared in this window.",
          citationIds: uniqueStrings([
            dailySynthesisCitations.get(item.clusterId)?.citationId,
          ]),
          storyClusterId: item.clusterId,
        };
      },
    ),
  ];
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
  uniqueStrings(
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

const uniqueStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values.filter(
      (value): value is string => value !== undefined && value.length > 0,
    ),
  ),
];
