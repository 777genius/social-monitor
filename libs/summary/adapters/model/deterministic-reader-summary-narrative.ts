import type { ReaderSummaryNarrativeSection } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import {
  selectDeterministicNarrativeCitations,
} from "./deterministic-reader-summary-citation-selection";
import { buildDeterministicReaderSecondarySections } from "./deterministic-reader-summary-secondary-sections";

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

  const topStoryByClusterId = new Map(
    params.topStories.map((story) => [story.storyClusterId, story] as const),
  );
  const { leadCitationIds, dailySynthesisCitations } =
    selectDeterministicNarrativeCitations({
      mode: params.input.coveragePlan.mode,
      lead,
      secondary: params.input.coveragePlan.secondary,
      citationMap: params.citationMap,
    });
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
    ...buildDeterministicReaderSecondarySections(
      params.input.coveragePlan.secondary,
      topStoryByClusterId,
      dailySynthesisCitations,
    ),
  ];
};

