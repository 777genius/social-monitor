export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
};

export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

export const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
};

export const requiredArray = <T>(
  value: unknown,
  label: string,
): readonly T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value as T[];
};

export const requiredStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  requiredArray<unknown>(value, label).map((item) =>
    requiredString(item, label),
  );

export const requiredOptionalStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  value === undefined || value === null
    ? []
    : requiredStringArray(value, label);

export const requiredRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  const record = asRecord(value);
  if (record === null) {
    throw new Error(`${label} must be an object`);
  }

  return record;
};

export const normalizeSetValue = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`Unsupported ${label}`);
  }

  return value as T;
};

export const numberOrFallback = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

/** Tolerantly decode optional provider arrays without trusting their elements. */
export const normalizeRecordArray = (
  value: unknown,
): readonly Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null);
};
