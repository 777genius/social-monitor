export type JsonRecord = Record<string, unknown>;

/** Require a record-valued response field. */
export function readRecord(source: JsonRecord, field: string): JsonRecord {
  const value = source[field];
  if (!Object.hasOwn(source, field) || !isRecord(value)) {
    throw new Error(`Expected ${field} to be an object`);
  }

  return value;
}

/** Require a non-empty string field without changing its whitespace. */
export function readString(source: JsonRecord, field: string): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }

  return value;
}

/** Read an optional non-empty string without trimming its value. */
export function optionalString(source: JsonRecord, field: string): string | undefined {
  const value = source[field];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

/** Require a finite numeric response field. */
export function readNumber(source: JsonRecord, field: string): number {
  const value = source[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${field} to be a finite number`);
  }

  return value;
}

/** Require an array of non-empty strings. */
export function readStringArray(source: JsonRecord, field: string): readonly string[] {
  const value = source[field];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`Expected ${field} to be a string array`);
  }

  return value;
}

/** Require an array of record-shaped values. */
export function readObjectArray(
  source: JsonRecord,
  field: string,
): readonly JsonRecord[] {
  const value = source[field];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`Expected ${field} to be an object array`);
  }

  return value as readonly JsonRecord[];
}

/** Require at least one item and return the original first item. */
export function readFirst<T>(values: readonly T[], label: string): T {
  const first = values[0];
  if (first === undefined) {
    throw new Error(`Expected at least one ${label}`);
  }

  return first;
}

/** Match non-null objects but not arrays. */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

