import type { ReaderSummaryNarrativeSection } from "../../domain";
import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import {
  selectDeterministicNarrativeCitations,
} from "./deterministic-reader-summary-citation-selection";
import { buildDeterministicReaderSecondarySections } from "./deterministic-reader-summary-secondary-sections";
import { buildDeterministicReaderLeadSection } from "./deterministic-reader-summary-lead-section";

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
  const leadSection = buildDeterministicReaderLeadSection({
    input: params.input,
    executiveSummary: params.executiveSummary,
    lead,
    leadStory: topStoryByClusterId.get(lead.clusterId),
    leadCitationIds,
  });
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

