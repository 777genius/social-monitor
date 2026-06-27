export const requiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
};

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

export const requiredNumber = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  return value;
};

export const requiredArray = (
  value: unknown,
  fieldName: string,
): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value;
};

export const normalizeStringArray = (
  value: unknown,
  fieldName: string,
): readonly string[] => {
  const values = requiredArray(value, fieldName);

  return values.map((item, index) =>
    requiredString(item, `${fieldName}[${index}]`),
  );
};

export const normalizeOptionalStringArray = (
  value: unknown,
): readonly string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizeStringArray(value, 'optionalStringArray');
};

export const requiredRecord = (
  value: unknown,
  fieldName: string,
): Record<string, unknown> => {
  const record = asRecord(value);

  if (record === null) {
    throw new Error(`${fieldName} must be an object`);
  }

  return record;
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const optionalNonNegativeInteger = (
  value: unknown,
): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

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
