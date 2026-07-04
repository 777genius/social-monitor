import type {
  SourceRuntimeConfig,
  SourceRuntimeConfigValue,
} from "../../ports";

export const readRecord = (
  value: unknown,
): Readonly<Record<string, SourceRuntimeConfigValue>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, SourceRuntimeConfigValue>>)
    : undefined;

export const readArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

export const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

export const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export const readOptionalPositiveInteger = (
  value: unknown,
): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;

export const compactRuntimeConfig = (
  value: Readonly<Record<string, SourceRuntimeConfigValue | undefined>>,
): SourceRuntimeConfig =>
  Object.fromEntries(
    Object.entries(value).filter((entry): entry is [
      string,
      SourceRuntimeConfigValue,
    ] => entry[1] !== undefined),
  );

export const compactUnique = <T extends string>(
  values: readonly T[],
): readonly T[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean) as T[])];

export const compactUniqueBy = <T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): readonly T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
};
