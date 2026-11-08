import type { ReaderSummaryTopicNodeLabel } from "../../domain";
import type { ReaderSummaryTopicLabelerInput } from "../../ports";
import { meaningfulTopicLabelTokens } from "../../domain/services/reader-summary-topic-map-label-quality";
import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";

export const groundedNodeAnchors = (
  label: ReaderSummaryTopicNodeLabel,
  candidate: ReaderSummaryTopicLabelerInput["candidates"][number] | undefined,
): ReadonlySet<string> =>
  new Set(
    [
      label.label,
      label.semantic?.parentSubject,
      ...(label.keywords ?? []),
      candidate?.fallbackLabel,
      ...(candidate?.keywords ?? []),
      ...(candidate?.labelCandidates.map((item) => item.label) ?? []),
    ].flatMap((value) => (value === undefined ? [] : anchorKeys(value))),
  );

export const identityAnchors = (
  label: ReaderSummaryTopicNodeLabel,
): ReadonlySet<string> =>
  new Set(
    [
      label.label,
      label.semantic?.subject,
      label.semantic?.parentSubject,
      label.semantic?.qualifier,
    ].flatMap((value) => (value === undefined ? [] : anchorKeys(value))),
  );

export const anchorKeys = (value: string): readonly string[] =>
  meaningfulTopicLabelTokens(value)
    .map(normalizeTopicLabel)
    .filter((token) => token.length > 1 && !noiseAnchors.has(token));

export const intersects = (
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string>,
): boolean => left !== undefined && [...left].some((value) => right.has(value));

export const uniqueRecoveredGroupId = (
  label: string,
  existing: ReadonlySet<string>,
): string => {
  const base = `group:${normalizeTopicLabel(label)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
};

export const genericAnchors = new Set([
  "agent",
  "ai",
  "coding",
  "developer",
  "ecosystem",
  "family",
  "group",
  "model",
  "product",
  "software",
  "technology",
  "tool",
  "workflow",
]);

export const noiseAnchors = new Set([
  "com",
  "http",
  "https",
  "item",
  "reddit",
  "status",
  "topic",
  "twitter",
  "url",
  "ycombinator",
]);
