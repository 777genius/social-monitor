import type { SummaryQualityFlag } from '../../domain';
import { summaryQualityFlagSet } from './openai-responses-summary-draft-shape';
import { normalizeStringArray, optionalString } from './openai-responses-summary-json';

// Backwards-compatible references for callers of the historical quality boundary.
export { normalizeRisks } from './openai-responses-summary-risks';
export { normalizeConfidence } from './openai-responses-summary-confidence';

const defaultNoSignalReason =
  'No eligible evidence items selected for this interest.';

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

