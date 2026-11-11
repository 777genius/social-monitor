import { optionalString, requiredStringArray } from "./openai-responses-reader-summary-raw-values";

// Presentation values tolerate sparse display fields; raw JSON admissions do not.
export const uniqueNonEmptyStrings = (
  values: readonly string[],
): readonly string[] => [
  ...new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ),
];

export const knownStringSubset = (
  values: readonly string[],
  allowed: ReadonlySet<string>,
): readonly string[] =>
  uniqueNonEmptyStrings(values).filter((value) => allowed.has(value));

export const firstNonEmptyString = (
  ...values: readonly (string | undefined)[]
): string => {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "Review cited source evidence.";
};

export const normalizeStringArrayLike = (
  value: unknown,
  label: string,
): readonly string[] => {
  if (Array.isArray(value)) {
    return requiredStringArray(value, label);
  }

  const scalar = optionalString(value);
  if (scalar === undefined) {
    return [];
  }

  return uniqueNonEmptyStrings(scalar.split(","));
};
