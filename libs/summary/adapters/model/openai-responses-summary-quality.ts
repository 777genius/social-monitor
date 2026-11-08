import type { SummaryConfidence, SummaryQualityFlag, SummaryRisk } from '../../domain';
import { summaryQualityFlagSet } from './openai-responses-summary-draft-shape';
import { normalizeOptionalStringArray, normalizeStringArray, optionalString, requiredArray, requiredNumber, requiredRecord, requiredString } from './openai-responses-summary-json';
import { stringOrFallback } from './openai-responses-summary-text';

const defaultNoSignalReason =
  'No eligible evidence items selected for this interest.';

const confidenceLevels = new Set<SummaryConfidence['level']>([
  'none',
  'low',
  'medium',
  'high',
]);
const riskReasons = new Set<NonNullable<SummaryRisk['reason']>>([
  'insufficient_evidence',
  'conflicting_evidence',
  'source_limit',
]);

export const normalizeRisks = (value: unknown): readonly SummaryRisk[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'risksAndUnknowns');

  return values.map((item, index) => {
    if (typeof item === 'string') {
      return {
        description: stringOrFallback(item, `Unspecified risk ${index + 1}`),
        citationIds: undefined,
        reason: undefined,
      };
    }

    const record = requiredRecord(item, `risksAndUnknowns[${index}]`);
    const reason = optionalString(record.reason);

    if (
      reason !== undefined &&
      !riskReasons.has(reason as NonNullable<SummaryRisk['reason']>)
    ) {
      throw new Error(
        `Invalid summary risk reason at risksAndUnknowns[${index}].reason`,
      );
    }
    const description = stringOrFallback(
      record.description ?? record.risk,
      `Unspecified risk ${index + 1}`,
    );

    return {
      description,
      citationIds:
        (record.citationIds ?? record.citations) === null
          ? undefined
          : normalizeOptionalStringArray(record.citationIds ?? record.citations),
      reason: reason as SummaryRisk['reason'],
    };
  });
};

export const normalizeQualityFlags = (
  value: unknown,
): readonly SummaryQualityFlag[] => {
  const values =
    value === undefined || value === null
      ? []
      : typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? normalizeStringArray(value, 'qualityFlags')
          : qualityFlagKeysFromRecord(value);

  return values.filter((flag): flag is SummaryQualityFlag =>
    summaryQualityFlagSet.has(flag as SummaryQualityFlag),
  );
};

const qualityFlagKeysFromRecord = (value: unknown): readonly string[] => {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return [];
  }

  return Object.entries(value)
    .filter(([, enabled]) => enabled === true)
    .map(([flag]) => flag);
};

export const normalizeNoSignalReason = (
  value: unknown,
  normalizedQualityFlags: readonly SummaryQualityFlag[],
): string | undefined => {
  const reason = optionalString(value);

  if (reason !== undefined || !normalizedQualityFlags.includes('no_signal')) {
    return reason;
  }

  return defaultNoSignalReason;
};

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

