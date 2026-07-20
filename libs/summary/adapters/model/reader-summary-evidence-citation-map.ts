import type { ReaderSummaryCitation, SummaryEvidenceItem } from "../../domain";

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
