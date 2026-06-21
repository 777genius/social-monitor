import type { GeneratedSummaryDraft, SummaryEvidenceSelection } from '../../ports';

export const validateSummaryCitationsAgainstEvidence = (
  draft: GeneratedSummaryDraft,
  evidence: SummaryEvidenceSelection,
): void => {
  const selectedFeedItemIds = new Set(evidence.sourceWindow.selectedFeedItemIds);
  const evidenceByFeedItemId = new Map(evidence.items.map((item) => [item.feedItemId, item]));
  const citationIds = new Set<string>();

  for (const selectedFeedItemId of selectedFeedItemIds) {
    if (!evidenceByFeedItemId.has(selectedFeedItemId)) {
      throw new Error(`Summary citation validation failed: source window selected unknown feed item ${selectedFeedItemId}`);
    }
  }

  for (const citation of draft.citationMap) {
    if (citation.citationId.trim().length === 0) {
      throw new Error('Summary citation validation failed: citation id must be non-empty');
    }

    if (citationIds.has(citation.citationId)) {
      throw new Error(`Summary citation validation failed: duplicate citation id ${citation.citationId}`);
    }

    citationIds.add(citation.citationId);

    if (!selectedFeedItemIds.has(citation.feedItemId)) {
      throw new Error(`Summary citation validation failed: citation ${citation.citationId} references unselected feed item`);
    }

    const evidenceItem = evidenceByFeedItemId.get(citation.feedItemId);

    if (evidenceItem === undefined) {
      throw new Error(`Summary citation validation failed: citation ${citation.citationId} references missing feed evidence`);
    }

    if (evidenceItem.sourceItemId !== citation.sourceItemId) {
      throw new Error(`Summary citation validation failed: citation ${citation.citationId} source item mismatch`);
    }

    if (evidenceItem.providerKey !== citation.providerKey) {
      throw new Error(`Summary citation validation failed: citation ${citation.citationId} provider key mismatch`);
    }
  }

  for (const keyPoint of draft.keyPoints) {
    for (const citationId of keyPoint.citationIds) {
      assertKnownCitation(citationIds, citationId, 'key point');
    }
  }

  for (const risk of draft.risksAndUnknowns) {
    for (const citationId of risk.citationIds ?? []) {
      assertKnownCitation(citationIds, citationId, 'risk');
    }
  }
};

const assertKnownCitation = (citationIds: ReadonlySet<string>, citationId: string, owner: string): void => {
  if (!citationIds.has(citationId)) {
    throw new Error(`Summary citation validation failed: ${owner} cites ${citationId} outside citation map`);
  }
};
