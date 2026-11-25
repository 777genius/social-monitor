import type { SummaryModelInput } from '../../ports';
import { normalizeCitationMap } from './openai-responses-summary-citations';
import {
  fallbackCitationMap,
  withEvidenceBackedCitations,
} from './openai-responses-summary-evidence-citations';

/**
 * Interpret untrusted provider citations once, then ground every accepted
 * identity in selected evidence before draft claims or risks use those ids.
 */
export const buildOpenAiSummaryTrustedCitationContext = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
) => {
  const modelCitationMap = normalizeCitationMap(raw.citationMap);
  const citationMap = withEvidenceBackedCitations(
    modelCitationMap.length === 0
      ? fallbackCitationMap(input.evidence.items)
      : modelCitationMap,
    input.evidence.items,
  );
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );
  return { citationMap, knownCitationIds };
};
