import {
  readerSummaryTopicClaimTypes,
  type ReaderSummaryTopicClaimType,
  type ReaderSummaryTopicSemanticLabel,
} from "../../domain";

export const readRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    : [];

export const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

export const stringValue = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const optionalString = (value: unknown): string | undefined => {
  const text = stringValue(value);

  return text.length > 0 ? text : undefined;
};

export const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const semanticLabelFromRaw = (
  value: Record<string, unknown>,
  fallbackSubject: string | undefined,
): ReaderSummaryTopicSemanticLabel => ({
  subject: optionalString(value.subject) ?? fallbackSubject ?? "Topic",
  parentSubject: optionalString(value.parentSubject),
  claimType: claimTypeValue(value.claimType),
  qualifier: optionalString(value.qualifier),
  confidenceScore: Math.min(
    1,
    Math.max(0, numberValue(value.confidenceScore) ?? 0),
  ),
});

export const claimTypeValue = (value: unknown): ReaderSummaryTopicClaimType => {
  const candidate = optionalString(value);

  return readerSummaryTopicClaimTypes.includes(
    candidate as ReaderSummaryTopicClaimType,
  )
    ? (candidate as ReaderSummaryTopicClaimType)
    : "other";
};

