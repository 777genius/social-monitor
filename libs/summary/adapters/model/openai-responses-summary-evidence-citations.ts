import type { SummaryCitation } from '../../domain';
import type { SummaryModelInput } from '../../ports';

export const fallbackCitationMap = (
  evidenceItems: SummaryModelInput['evidence']['items'],
): readonly SummaryCitation[] =>
  evidenceItems.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: chooseEvidenceCitationField(item, 'bodyPreview'),
  }));

export const withEvidenceBackedCitations = (
  citations: readonly SummaryCitation[],
  evidenceItems: SummaryModelInput['evidence']['items'],
): readonly SummaryCitation[] => {
  const evidenceByCitationId = new Map<
    string,
    SummaryModelInput['evidence']['items'][number]
  >(evidenceItems.map((item, index) => [`c${index + 1}`, item] as const));

  return citations.flatMap((citation) => {
    const evidence = evidenceByCitationId.get(citation.citationId);

    if (evidence === undefined) {
      return [];
    }

    return [
      {
        ...citation,
        feedItemId: evidence.feedItemId,
        sourceItemId: evidence.sourceItemId,
        providerKey: evidence.providerKey,
        canonicalUrl: evidence.canonicalUrl,
        field: chooseEvidenceCitationField(evidence, citation.field),
      },
    ];
  });
};

export const chooseEvidenceCitationField = (
  evidence: SummaryModelInput['evidence']['items'][number],
  preferred: SummaryCitation['field'],
): SummaryCitation['field'] => {
  if (preferred === 'title') {
    return 'title';
  }

  if (
    preferred === 'bodyPreview' &&
    (evidence.bodyPreview ?? '').trim().length > 0
  ) {
    return 'bodyPreview';
  }

  if (
    preferred === 'canonicalUrl' &&
    (evidence.canonicalUrl ?? '').trim().length > 0
  ) {
    return 'canonicalUrl';
  }

  return 'title';
};
