import type { SummaryCitation, SummaryKeyPoint } from '../../domain';
import { normalizeCitationIds } from './openai-responses-summary-citations';
import { requiredArray, requiredRecord } from './openai-responses-summary-json';
import { stringOrFallback } from './openai-responses-summary-text';

export const normalizeKeyPoints = (
  value: unknown,
  citationMap: readonly SummaryCitation[],
): readonly SummaryKeyPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'keyPoints');

  return values.map((item, index) => {
    if (typeof item === 'string') {
      return {
        claim: stringOrFallback(item, `Evidence signal ${index + 1}`),
        citationIds: fallbackCitationIdsForKeyPoint(index, citationMap),
      };
    }

    const record = requiredRecord(item, `keyPoints[${index}]`);
    const claim = stringOrFallback(
      record.claim ?? record.point ?? record.title,
      `Evidence signal ${index + 1}`,
    );
    const citationIds = normalizeCitationIds(
      record.citationIds ?? record.citations,
      `keyPoints[${index}].citationIds`,
    );

    return {
      claim,
      citationIds:
        citationIds.length === 0
          ? fallbackCitationIdsForKeyPoint(index, citationMap)
          : citationIds,
    };
  });
};

const fallbackCitationIdsForKeyPoint = (
  index: number,
  citationMap: readonly SummaryCitation[],
): readonly string[] => {
  const indexedCitation = citationMap[index]?.citationId;
  if (indexedCitation !== undefined) {
    return [indexedCitation];
  }

  const firstCitation = citationMap[0]?.citationId;
  return firstCitation === undefined ? [] : [firstCitation];
};

