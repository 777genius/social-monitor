import { isGitHubTrendingEvidence, primaryReaderSummaryEvidence,
  type ReaderSummaryCitation, type SummaryEvidenceItem, type SummaryEvidenceSelection } from "../../domain";

/** The daily article cites its frozen narrative inputs, plus the separate GitHub appendix.
 * The promotion board can contain different ordinary posts and is never citation authority.
 */
export const readerSummaryCitableEvidence = (
  selection: SummaryEvidenceSelection,
): readonly SummaryEvidenceItem[] => {
  if (selection.dailyGenerationInput === undefined) return selection.selectedEvidence;
  const narrative = primaryReaderSummaryEvidence(selection).selectedEvidence;
  const narrativeIds = new Set(narrative.map(item => item.feedItemId));
  return [...narrative, ...selection.selectedEvidence.filter(item =>
    isGitHubTrendingEvidence(item) && !narrativeIds.has(item.feedItemId))];
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
