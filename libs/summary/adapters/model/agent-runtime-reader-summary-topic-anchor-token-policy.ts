import { meaningfulTopicLabelTokens } from "../../domain/services/reader-summary-topic-map-label-quality";
import { normalizeTopicLabel } from "../../domain/services/reader-summary-topic-map-text";

/** Stable, fail-closed recovery anchor vocabulary and token intersection policy. */
export const anchorKeys = (value: string): readonly string[] =>
  meaningfulTopicLabelTokens(value)
    .map(normalizeTopicLabel)
    .filter((token) => token.length > 1 && !noiseAnchors.has(token));

export const intersects = (
  left: ReadonlySet<string> | undefined,
  right: ReadonlySet<string>,
): boolean => left !== undefined && [...left].some((value) => right.has(value));

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
