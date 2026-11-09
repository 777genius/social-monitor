import type { GeneratedSummaryDraft } from '../../ports';

// Citation integrity is a fail-closed boundary; call it before quality/usage checks.
export const assertOpenAiSummaryDraftCitations = (
  draft: Pick<GeneratedSummaryDraft, 'citationMap' | 'keyPoints' | 'risksAndUnknowns'>,
): void => {
  const citationIds = new Set<string>();

  for (const citation of draft.citationMap) {
    if (citation.citationId.trim().length === 0) {
      throw new Error('Summary citation id must be non-empty');
    }

    if (citationIds.has(citation.citationId)) {
      throw new Error(`Duplicate summary citation id ${citation.citationId}`);
    }

    citationIds.add(citation.citationId);
  }

  for (const keyPoint of draft.keyPoints) {
    if (
      keyPoint.claim.trim().length === 0 ||
      keyPoint.citationIds.length === 0
    ) {
      throw new Error('Summary key point must include a claim and citations');
    }

    for (const citationId of keyPoint.citationIds) {
      if (!citationIds.has(citationId)) {
        throw new Error(
          `Summary key point cites unknown citation ${citationId}`,
        );
      }
    }
  }

  for (const risk of draft.risksAndUnknowns) {
    if (risk.description.trim().length === 0) {
      throw new Error('Summary risk description must be non-empty');
    }

    for (const citationId of risk.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        throw new Error(`Summary risk cites unknown citation ${citationId}`);
      }
    }
  }
};
