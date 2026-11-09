export const normalizeExpandedLegacyStoryStatus = (value: unknown): unknown =>
  value === "snapshot" ? "new" : normalizeLegacyStoryStatus(value);

export const normalizeExpandedLegacySectionKind = (value: unknown): unknown =>
  value === "story" ? "development" : normalizeLegacySectionKind(value);

export const normalizeLegacySectionKind = (value: unknown): unknown =>
  value === "supporting" || value === "context"
    ? "development"
    : value === "risk"
      ? "watch"
      : value;

export const normalizeLegacyStoryStatus = (value: unknown): unknown =>
  value === "open" ? "watch" : value;
