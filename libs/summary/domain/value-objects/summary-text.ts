export const plural = (count: number): string => (count === 1 ? "" : "s");

export const uniqueNonEmpty = (
  values: readonly string[],
): readonly string[] => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (value.length === 0 || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};

export const compactUnique = (
  values: readonly (string | undefined)[],
): readonly string[] =>
  uniqueNonEmpty(
    values.filter((value): value is string => value !== undefined),
  );

export const nonEmpty = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed;
};

export const readerSummaryHeadline = (
  value: string,
  fallback = "Workspace summary",
): string => {
  const headline = nonEmpty(value, fallback);
  const withoutTerminalFullStop = headline
    .replace(/[.\u2026\u3002]+$/u, "")
    .trimEnd();

  return withoutTerminalFullStop.length === 0
    ? nonEmpty(fallback, "Workspace summary")
    : withoutTerminalFullStop;
};

export const firstSentence = (value: string): string | undefined => {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed);
  return match?.[1] ?? trimmed;
};

export const interestTitle = (interestId: string): string =>
  interestId
    .split(/[-_:\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
