import { primaryReaderSummaryEvidence,
  type SummaryEvidenceItem, type SummaryEvidenceSelection } from "../../domain";

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
