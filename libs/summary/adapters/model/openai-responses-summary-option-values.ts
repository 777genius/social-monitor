// OpenAI summary adapter environment/constructor option normalization.
export const nonEmptyOrFallback = (
  value: string | undefined,
  fallback: string,
): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

export const positiveIntegerOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  Number.isInteger(value) && value !== undefined && value > 0
    ? value
    : fallback;

export const nonNegativeNumberOrFallback = (
  value: number | undefined,
  fallback: number,
): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

export const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const parseNonNegativeNumber = (
  value: string | undefined,
): number | undefined => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};
