import {
  buildReaderSummary,
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
  const content = buildReaderSummary({
    headline: draft.headline,
    executiveSummary: draft.executiveSummary,
    narrativeSections: draft.content?.narrativeSections,
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
    qualityFlags: draft.qualityFlags,
    noSignalReason: draft.noSignalReason,
  });
  return { ...draft, content };
};
