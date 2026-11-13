export const requiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
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
