import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
import type { TopReadCandidate } from "../entities/top-read";
import { isReaderSummaryLeadEligibleEvidence } from "./reader-summary-lead-eligibility-policy";
import {
  citationMapByFeedItemId,
  storyWithTopReadEligibleCitations,
} from "./top-read-candidate-identity-policy";
import {
  isReaderFacingQualityTopRead,
  type RenderedTopReadCandidate,
} from "./rendered-top-read-selection-policy";
import {
  buildThematicSynthesisSupport,
  readerHeadlineForNarrativeLead,
} from "./reader-summary-narrative-headline-policy";
import { STORY_RANKING_POLICY_V1 } from "./story-ranking-policy";
import {
  sharedStoryTopicTokenCount,
  storyPrimaryClaimFacet,
  storyTopicEventTokens,
  storyTopicSimilarity,
  storyTopicSpecificProductTokens,
  storyTopicTokens,
} from "../services/story-topic-tokenizer";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import type {
  ReaderSummaryWeeklyModelCitation,
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";

type ThematicSynthesisSupport = {
  readonly clusterCount: number;
  readonly providerCount: number;
};

export type ReaderSummaryWeeklyStorySynthesisAssessment = Readonly<{
  stableStoryIdentityIsUsed: boolean;
  sameDayStoryObservationsAreUnique: boolean;
  duplicateSameDayStoryObservationCount: number;
  crossDayStoryCount: number;
  synthesizedCrossDayStoryCount: number;
}>;

export const assertReaderSummaryWeeklyModelStoryObservationsUnique = (
  input: ReaderSummaryWeeklyModelInput,
): void => {
  const duplicateSameDayStoryObservationCount = duplicateCount(
    input.observations.map(
      (observation) =>
        `${observation.storyId}\u0000${observation.observedOn}`,
    ),
  );
  if (duplicateSameDayStoryObservationCount > 0) {
    throw new Error(
      "Reader summary weekly evidence contains duplicate same-story same-day observations",
    );
  }
};

export const assessReaderSummaryWeeklyStorySynthesis = (params: {
  readonly input: ReaderSummaryWeeklyModelInput;
  readonly output: ReaderSummaryWeeklyModelOutput;
}): ReaderSummaryWeeklyStorySynthesisAssessment => {
  const knownStoryIds = new Set(
    params.input.stories.map((story) => story.storyId),
  );
  const citationById = new Map(
    params.input.citations.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  const outputStoryIds = params.output.stories.map((story) => story.storyId);
  const outputStoryIdSet = new Set(outputStoryIds);
  const duplicateSameDayStoryObservationCount = duplicateCount(
    params.input.observations.map(
      (observation) =>
        `${observation.storyId}\u0000${observation.observedOn}`,
    ),
  );
  const stableStoryIdentityIsUsed =
    outputStoryIds.length > 0 &&
    outputStoryIdSet.size === outputStoryIds.length &&
    outputStoryIds.every((storyId) => knownStoryIds.has(storyId)) &&
    params.output.stories.every((story) =>
      citationsUseStoryIdentity(story.citationIds, story.storyId, citationById),
    ) &&
    params.output.sections.every(
      (section) =>
        outputStoryIdSet.has(section.storyId) &&
        citationsUseStoryIdentity(
          section.citationIds,
          section.storyId,
          citationById,
        ),
    );
  const crossDayStoryIds = new Set(
    params.output.stories
      .filter(
        (story) =>
          citedDays(story.citationIds, citationById, story.storyId).size >= 2,
      )
      .map((story) => story.storyId),
  );
  const synthesisDaysByStory = citedDaysByStory(
    params.output.synthesisCitationIds,
    citationById,
  );
  const synthesizedCrossDayStoryIds = new Set(
    params.output.sections
      .filter(
        (section) =>
          section.kind === "lead" &&
          crossDayStoryIds.has(section.storyId) &&
          citedDays(
            section.citationIds,
            citationById,
            section.storyId,
          ).size >= 2 &&
          (synthesisDaysByStory.get(section.storyId)?.size ?? 0) >= 2,
      )
      .map((section) => section.storyId),
  );

  return Object.freeze({
    stableStoryIdentityIsUsed,
    sameDayStoryObservationsAreUnique:
      duplicateSameDayStoryObservationCount === 0,
    duplicateSameDayStoryObservationCount,
    crossDayStoryCount: crossDayStoryIds.size,
    synthesizedCrossDayStoryCount: synthesizedCrossDayStoryIds.size,
  });
};

export const resolveReaderSummaryNarrativeLead = (params: {
  readonly sections: readonly ReaderSummaryNarrativeSection[];
  readonly stories: readonly TopReadCandidate[];
  readonly citations: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly evidence: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly clusters: readonly StoryCluster[];
  readonly clusterById: ReadonlyMap<string, StoryCluster>;
}): {
  readonly section: ReaderSummaryNarrativeSection | undefined;
  readonly story: TopReadCandidate | undefined;
  readonly thematicSynthesisSupport: ThematicSynthesisSupport | undefined;
} => {
  const section = params.sections.find((candidate) => candidate.kind === "lead");
  const authoredStory = params.stories.find(
    (story) => story.storyClusterId === section?.storyClusterId,
  );

  return {
    section,
    story:
      authoredStory === undefined
        ? undefined
        : storyWithTopReadEligibleCitations(
            authoredStory,
            params.citations,
            params.evidence,
            params.clusterById,
            citationMapByFeedItemId(params.citations),
          ),
    thematicSynthesisSupport:
      section === undefined || section.storyClusterId !== undefined
        ? undefined
        : buildThematicSynthesisSupport({
            section,
            citations: params.citations,
            evidence: params.evidence,
            clusters: params.clusters,
          }),
  };
};

export const uniqueReaderSummaryStoryPool = (
  stories: readonly TopReadCandidate[],
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();

  return stories.filter((story) => {
    if (seen.has(story.storyClusterId)) {
      return false;
    }
    seen.add(story.storyClusterId);
    return true;
  });
};

export const reconcileReaderSummaryNarrativeLead = (params: {
  readonly selected: readonly RenderedTopReadCandidate[];
  readonly rendered: readonly RenderedTopReadCandidate[];
  readonly narrativeStory: TopReadCandidate | undefined;
  readonly narrativeSection: ReaderSummaryNarrativeSection | undefined;
  readonly narrativeSections: readonly ReaderSummaryNarrativeSection[];
  readonly inputHeadline: string;
}): {
  readonly candidates: readonly RenderedTopReadCandidate[];
  readonly narrativeSections: readonly ReaderSummaryNarrativeSection[];
  readonly headline: string;
} => {
  const narrative = params.rendered.find(
    (candidate) =>
      candidate.story.storyClusterId === params.narrativeStory?.storyClusterId,
  );
  const acceptedNarrative = acceptedNarrativeLeadCandidate({
    selected: params.selected[0],
    narrative,
  });
  const candidates = replaceSelectedLeadWithNarrative({
    selected: params.selected,
    narrative: acceptedNarrative,
  });
  const rejected =
    params.narrativeSection?.storyClusterId !== undefined &&
    acceptedNarrative === undefined;
  const headlineLead =
    acceptedNarrative ?? (rejected ? candidates[0] : undefined);

  return {
    candidates,
    narrativeSections: rejected
      ? params.narrativeSections.filter(
          (section) => section.id !== params.narrativeSection?.id,
        )
      : params.narrativeSections,
    headline:
      headlineLead === undefined
        ? params.inputHeadline
        : readerHeadlineForNarrativeLead(
            headlineLead.story.title,
            headlineLead.topRead,
          ),
  };
};

export const hasStrictPairwiseReaderSummaryStoryIdentity = (params: {
  readonly leftEvidence: readonly SummaryEvidenceItem[];
  readonly rightEvidence: readonly SummaryEvidenceItem[];
}): boolean =>
  params.leftEvidence.some((left) =>
    params.rightEvidence.some((right) => evidencePairHasStoryIdentity(left, right)),
  );

const evidencePairHasStoryIdentity = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  if (
    !isReaderSummaryLeadEligibleEvidence(left) ||
    !isReaderSummaryLeadEligibleEvidence(right)
  ) {
    return false;
  }
  const leftFacet = storyPrimaryClaimFacet(left);
  const rightFacet = storyPrimaryClaimFacet(right);
  if (leftFacet === undefined || leftFacet !== rightFacet) {
    return false;
  }
  const leftTokens = storyTopicTokens(left, STORY_RANKING_POLICY_V1);
  const rightTokens = storyTopicTokens(right, STORY_RANKING_POLICY_V1);
  if (!hasSharedNamedProductOrModel(leftTokens, rightTokens)) {
    return false;
  }
  const leftEvents = storyTopicEventTokens(leftTokens);
  const rightEvents = storyTopicEventTokens(rightTokens);
  if (
    (leftEvents.length > 0 || rightEvents.length > 0) &&
    sharedStoryTopicTokenCount(leftEvents, rightEvents) === 0
  ) {
    return false;
  }

  return (
    sharedStoryTopicTokenCount(leftTokens, rightTokens) >=
      minimumSharedTopicTokens &&
    storyTopicSimilarity(leftTokens, rightTokens) >= minimumTopicSimilarity
  );
};

const hasSharedNamedProductOrModel = (
  leftTokens: readonly string[],
  rightTokens: readonly string[],
): boolean => {
  const leftProducts = storyTopicSpecificProductTokens(leftTokens).filter(
    isNamedProductOrModelToken,
  );
  const rightProducts = storyTopicSpecificProductTokens(rightTokens).filter(
    isNamedProductOrModelToken,
  );

  return sharedStoryTopicTokenCount(leftProducts, rightProducts) > 0;
};

const isNamedProductOrModelToken = (token: string): boolean =>
  !broadProductCategoryTokens.has(token);

const broadProductCategoryTokens = new Set([
  "coding-agent",
  "mcp",
  "session-cache",
]);
const minimumSharedTopicTokens = 5;
const minimumTopicSimilarity = 0.5;

const citationsUseStoryIdentity = (
  citationIds: readonly string[],
  storyId: string,
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): boolean =>
  citationIds.length > 0 &&
  new Set(citationIds).size === citationIds.length &&
  citationIds.every(
    (citationId) => citationById.get(citationId)?.storyId === storyId,
  );

const citedDays = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
  storyId: string,
): ReadonlySet<string> =>
  new Set(
    citationIds.flatMap((citationId) => {
      const citation = citationById.get(citationId);
      return citation?.storyId === storyId ? [citation.observedOn] : [];
    }),
  );

const citedDaysByStory = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const daysByStory = new Map<string, Set<string>>();
  for (const citationId of citationIds) {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      continue;
    }
    const days = daysByStory.get(citation.storyId) ?? new Set<string>();
    days.add(citation.observedOn);
    daysByStory.set(citation.storyId, days);
  }
  return daysByStory;
};

const duplicateCount = (values: readonly string[]): number => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
};

const acceptedNarrativeLeadCandidate = (params: {
  readonly selected: RenderedTopReadCandidate | undefined;
  readonly narrative: RenderedTopReadCandidate | undefined;
}): RenderedTopReadCandidate | undefined => {
  if (
    params.selected === undefined ||
    params.narrative === undefined ||
    !isReaderFacingQualityTopRead(
      params.narrative.topRead, params.narrative.evidence,
    )
  ) {
    return undefined;
  }
  const selectedClusterId = params.selected.story.storyClusterId.trim();
  if (
    selectedClusterId.length > 0 &&
    selectedClusterId === params.narrative.story.storyClusterId.trim()
  ) {
    return params.narrative;
  }

  return hasStrictPairwiseReaderSummaryStoryIdentity({
    leftEvidence: params.selected.evidence,
    rightEvidence: params.narrative.evidence,
  })
    ? params.narrative
    : undefined;
};

const replaceSelectedLeadWithNarrative = (params: {
  readonly selected: readonly RenderedTopReadCandidate[];
  readonly narrative: RenderedTopReadCandidate | undefined;
}): readonly RenderedTopReadCandidate[] => {
  const selectedLead = params.selected[0];
  if (selectedLead === undefined || params.narrative === undefined) {
    return params.selected;
  }

  return [
    params.narrative,
    ...params.selected.filter(
      (candidate) =>
        candidate.story.storyClusterId !== selectedLead.story.storyClusterId &&
        candidate.story.storyClusterId !==
          params.narrative?.story.storyClusterId,
    ),
  ];
};
