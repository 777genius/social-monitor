import type { SummaryCitation } from '../../domain';
import {
  normalizeStringArray,
  requiredArray,
  requiredRecord,
  requiredString,
} from './openai-responses-summary-required-json';

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

// Retain the existing citation API while separating evidence trust from draft references.
export {
  fallbackCitationMap,
  withEvidenceBackedCitations,
  chooseEvidenceCitationField,
} from './openai-responses-summary-evidence-citations';
export {
  withKnownCitationIds,
  withKnownRiskCitationIds,
} from './openai-responses-summary-citation-references';

export const normalizeCitationIds = (
  value: unknown,
  label: string,
): readonly string[] =>
  value === undefined || value === null
    ? []
    : normalizeStringArray(value, label);
