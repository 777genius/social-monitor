// Lenient projection for explicitly optional display fields and bounded fallbacks.
export const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

export const optionalArray = <T>(value: unknown): readonly T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export const optionalStringArray = (value: unknown): readonly string[] =>
  optionalArray<unknown>(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

export const nonNegativeNumberOrFallback = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
