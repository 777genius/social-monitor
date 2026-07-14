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
  const leadCitationIds =
    params.input.coveragePlan.mode === "daily_synthesis"
      ? uniqueStrings([
          firstCitationId(lead, citationsByFeedItemId),
          ...params.input.coveragePlan.secondary.map((item) =>
            firstCitationId(item, citationsByFeedItemId),
          ),
        ])
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
          citationIds: citationIdsFor(item, citationsByFeedItemId),
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

const firstCitationId = (
  item: ReaderSummaryCoveragePlanItem,
  citationsByFeedItemId: ReadonlyMap<
    string,
    readonly ReaderSummaryDraftCitation[]
  >,
): string | undefined => citationIdsFor(item, citationsByFeedItemId)[0];

const uniqueStrings = (
  values: readonly (string | undefined)[],
): readonly string[] => [
  ...new Set(
    values.filter(
      (value): value is string => value !== undefined && value.length > 0,
    ),
  ),
];
