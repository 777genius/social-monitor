import type {
  SummaryCitation,
  SummaryKeyPoint,
  SummaryRisk,
} from '../../domain';
import type { SummaryModelInput } from '../../ports';
import {
  normalizeStringArray,
  requiredArray,
  requiredRecord,
  requiredString,
} from './openai-responses-summary-json';

const citationFields = new Set<SummaryCitation['field']>([
  'title',
  'bodyPreview',
  'canonicalUrl',
]);

export const normalizeCitationMap = (
  value: unknown,
): readonly SummaryCitation[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'citationMap');

  return values.map((item, index) => {
    const record = requiredRecord(item, `citationMap[${index}]`);
    const field = requiredString(record.field, `citationMap[${index}].field`);

    if (!citationFields.has(field as SummaryCitation['field'])) {
      throw new Error(`Invalid citation field at citationMap[${index}].field`);
    }

    return {
      citationId: requiredString(
        record.citationId,
        `citationMap[${index}].citationId`,
      ),
      feedItemId: requiredString(
        record.feedItemId,
        `citationMap[${index}].feedItemId`,
      ),
      sourceItemId: requiredString(
        record.sourceItemId,
        `citationMap[${index}].sourceItemId`,
      ),
      providerKey: requiredString(
        record.providerKey,
        `citationMap[${index}].providerKey`,
      ),
      field: field as SummaryCitation['field'],
    };
  });
};

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

export const withKnownCitationIds = (
  keyPoints: readonly SummaryKeyPoint[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryKeyPoint[] =>
  keyPoints
    .map((keyPoint) => ({
      ...keyPoint,
      citationIds: knownStringSubset(keyPoint.citationIds, knownCitationIds),
    }))
    .filter((keyPoint) => keyPoint.citationIds.length > 0);

export const withKnownRiskCitationIds = (
  risks: readonly SummaryRisk[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryRisk[] =>
  risks.map((risk) => {
    if (risk.citationIds === undefined) {
      return risk;
    }

    const citationIds = knownStringSubset(risk.citationIds, knownCitationIds);

    return {
      ...risk,
      citationIds: citationIds.length === 0 ? undefined : citationIds,
    };
  });

const knownStringSubset = (
  values: readonly string[],
  knownValues: ReadonlySet<string>,
): readonly string[] => {
  const result: string[] = [];
  for (const value of values) {
    if (!knownValues.has(value) || result.includes(value)) {
      continue;
    }

    result.push(value);
  }

  return result;
};

export const normalizeCitationIds = (
  value: unknown,
  label: string,
): readonly string[] =>
  value === undefined || value === null
    ? []
    : normalizeStringArray(value, label);
