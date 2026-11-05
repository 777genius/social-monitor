import { primaryReaderSummaryEvidence,
  type ReaderSummaryCitation, type SummaryEvidenceItem, type SummaryEvidenceSelection } from "../../domain";

/** Daily writer IDs follow frozen narrative order; extra board/appendix citations
 * remain available to public cards, but are not passed as model evidence.
 */
export const readerSummaryCitableEvidence = (
  selection: SummaryEvidenceSelection,
): readonly SummaryEvidenceItem[] => {
  if (selection.dailyGenerationInput === undefined) return selection.selectedEvidence;
  const narrative = primaryReaderSummaryEvidence(selection).selectedEvidence;
  const narrativeIds = new Set(narrative.map(item => item.feedItemId));
  return [...narrative, ...selection.selectedEvidence.filter(item =>
    !narrativeIds.has(item.feedItemId))];
};

export const buildReaderSummaryEvidenceCitationMap = (
  evidenceItems: readonly SummaryEvidenceItem[],
): readonly ReaderSummaryCitation[] =>
  evidenceItems.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: item.canonicalUrl.length === 0 ? "title" : "canonicalUrl",
    canonicalUrl: item.canonicalUrl,
  }));
