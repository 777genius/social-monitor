import type { SummaryConfidence } from "../../domain";
import {
  requiredNumber,
  requiredRecord,
  requiredString,
} from "./openai-responses-summary-json";

// Missing confidence has a deterministic estimate; malformed supplied confidence fails closed.
const confidenceLevels = new Set<SummaryConfidence['level']>([
  'none',
  'low',
  'medium',
  'high',
]);
export const normalizeConfidence = (value: unknown): SummaryConfidence => {
  if (value === undefined || value === null) {
    return {
      level: 'medium',
      score: 0.62,
      rationale:
        'Confidence inferred from selected evidence because provider output omitted confidence metadata.',
    };
  }

  const record = requiredRecord(value, 'confidence');
  const level = requiredString(record.level, 'confidence.level');
  const score = requiredNumber(record.score, 'confidence.score');

  if (!confidenceLevels.has(level as SummaryConfidence['level'])) {
    throw new Error('Invalid summary confidence level');
  }

  return {
    level: level as SummaryConfidence['level'],
    score,
    rationale: requiredString(record.rationale, 'confidence.rationale'),
  };
};

