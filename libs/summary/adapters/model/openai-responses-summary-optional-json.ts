import { normalizeStringArray } from './openai-responses-summary-required-json';

export const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('Optional summary string value must be a string');
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

export const normalizeOptionalStringArray = (
  value: unknown,
): readonly string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizeStringArray(value, 'optionalStringArray');
};

export const optionalNonNegativeInteger = (
  value: unknown,
): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
