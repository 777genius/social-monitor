import {
  buildReaderSummary,
  buildReaderSummaryCoveragePlan,
  primaryReaderSummaryEvidence,
  type ReaderSummaryNarrativeSection,
  type SummaryEvidenceSelection,
} from "../../domain";
import type { ProviderReaderSummaryAttempt } from "../../ports";

type ReaderSummaryDraft = ProviderReaderSummaryAttempt["draft"];

export type ReaderSummaryDraftWithContent = Omit<
  ReaderSummaryDraft,
  "content"
> & {
  readonly content: NonNullable<ReaderSummaryDraft["content"]>;
};

export const buildReaderSummaryDraftWithPromotionContent = (
  evidence: SummaryEvidenceSelection,
  draft: ReaderSummaryDraft,
): ReaderSummaryDraftWithContent => {
  const buildContent = (
    narrativeSections: readonly ReaderSummaryNarrativeSection[] | undefined,
  ) => buildReaderSummary({
    headline: draft.headline,
    executiveSummary: draft.executiveSummary,
    narrativeSections,
    topStories: draft.topStories,
    interestHighlights: draft.interestHighlights,
    repeatedSignals: draft.repeatedSignals,
    risksAndUnknowns: draft.risksAndUnknowns,
    citationMap: draft.citationMap,
    storyClusters: evidence.clusters,
    approvedSameStoryRelations: evidence.approvedSameStoryRelations,
    relatedTopicRelations: evidence.relatedTopicRelations,
    sourceWindow: evidence.sourceWindow,
    selectedEvidence: evidence.selectedEvidence,
    editorialSlate: evidence.editorialSlate,
    promotionV3: evidence.promotionV3,
    qualityFlags: draft.qualityFlags,
    noSignalReason: draft.noSignalReason,
  });
  const content = buildContent(draft.content?.narrativeSections);
  const repairedLead = repairSingleStoryLead(evidence, draft, content);
  if (repairedLead === undefined) {
    return { ...draft, content };
  }

  const repairedContent = buildContent([
    repairedLead,
    ...(draft.content?.narrativeSections ?? []).filter(
      (section) => section.kind !== "lead",
    ),
  ]);
  return { ...draft, content: repairedContent };
};

const repairSingleStoryLead = (
  evidence: SummaryEvidenceSelection,
  draft: ReaderSummaryDraft,
  content: ReaderSummaryDraftWithContent["content"],
): ReaderSummaryNarrativeSection | undefined => {
  if (
    (content.narrativeSections?.some((section) => section.kind === "lead") ??
      false) ||
    buildReaderSummaryCoveragePlan(primaryReaderSummaryEvidence(evidence))
      .mode !== "single_story"
  ) {
    return undefined;
  }
  const firstRead = content.topReads[0];
  if (firstRead?.storyClusterId === undefined) {
    return undefined;
  }
  const story = draft.topStories.find(
    (candidate) => candidate.storyClusterId === firstRead.storyClusterId,
  );
  const text = story?.summary.trim();
  const citationIds = story?.citationIds.filter((citationId) =>
    firstRead.citationIds.includes(citationId),
  ) ?? [];
  if (story === undefined || text === undefined || text.length === 0 ||
      citationIds.length === 0) {
    return undefined;
  }
  return {
    id: "narrative-promotion-lead",
    kind: "lead",
    title: story.title,
    text,
    citationIds,
    storyClusterId: story.storyClusterId,
  };
};
