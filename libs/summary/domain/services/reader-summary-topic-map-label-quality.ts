import type {
  ReaderSummaryTopicGroupLabel,
  ReaderSummaryTopicNodeLabel,
} from "./reader-summary-topic-label-plan";
import {
  compactLabel,
  compactId,
  compactOptional,
  normalizeTopicLabel,
} from "./reader-summary-topic-map-text";
import {
  genericActionTokens,
  weakTopicLabelTokens,
} from "./reader-summary-topic-label-vocabulary";

export type TopicLabelQualityContext = {
  readonly evidenceTexts?: readonly string[];
  readonly providerLabels?: readonly string[];
  readonly candidateLabels?: readonly string[];
};

export type TopicLabelQualityResult = {
  readonly accepted: boolean;
  readonly label: string;
  readonly score: number;
  readonly meaningfulTokens: readonly string[];
  readonly groundedTokenCount: number;
  readonly reasons: readonly string[];
};

const metaTopicLabels = new Set([
  "reader summary",
  "topic labels",
  "topic map",
  "top reads",
  "source cards",
  "recommendations",
  "feedback loop",
  "visual tests",
  "workflow design",
  "rss quality",
  "source health",
  "hacker news",
  "reddit api",
  "x signals",
]);

const headlineClauseTokens = new Set([
  "accepted",
  "according",
  "any",
  "best",
  "biggest",
  "bringing",
  "brings",
  "caught",
  "come",
  "comes",
  "consuming",
  "created",
  "ditching",
  "dropped",
  "expect",
  "expected",
  "forget",
  "forgot",
  "gave",
  "happens",
  "hiring",
  "hate",
  "increase",
  "decrease",
  "here",
  "introducing",
  "love",
  "made",
  "migrate",
  "migrated",
  "migrates",
  "migrating",
  "normal",
  "presents",
  "replacing",
  "rolling",
  "run",
  "running",
  "say",
  "said",
  "says",
]);

const broadProductFamilyTokens = new Set([
  "anthropic",
  "chatgpt",
  "claude",
  "code",
  "codex",
  "copilot",
  "gemini",
  "github",
  "openai",
]);

const genericArtifactTokens = new Set([
  "extension",
  "feature",
  "plugin",
  "tool",
  "update",
]);

export const hasUsableTopicNodeLabel = (
  label: ReaderSummaryTopicNodeLabel,
): boolean =>
  compactId(label.topicId) !== undefined ||
  compactOptional(label.label) !== undefined ||
  compactId(label.groupId) !== undefined;

export const isUsableTopicLabel = (
  label: string,
  providerLabels: readonly string[],
): boolean => evaluateTopicLabelQuality(label, { providerLabels }).accepted;

export const isUsableTopicGroupLabel = (
  group: ReaderSummaryTopicGroupLabel,
  context: TopicLabelQualityContext = {},
): boolean =>
  compactId(group.id) !== undefined &&
  compactOptional(group.label) !== undefined &&
  !isWeakTopicId(group.id) &&
  evaluateTopicLabelQuality(group.label, context).accepted;

export const isWeakTopicId = (value: string | undefined): boolean => {
  const compact = compactId(value);
  if (compact === undefined) {
    return true;
  }
  const [, rawValue = compact] = compact.split(":");

  return isWeakTopicLabel(rawValue);
};

export const isWeakTopicLabel = (value: string): boolean => {
  const meaningfulTokens = meaningfulTopicLabelTokens(value);

  return meaningfulTokens.length === 0;
};

export const evaluateTopicLabelQuality = (
  value: string,
  context: TopicLabelQualityContext = {},
): TopicLabelQualityResult => {
  const label = compactLabel(value);
  const normalized = normalizeTopicLabel(label);
  const providerLabels = context.providerLabels ?? [];
  const meaningfulTokens = meaningfulTopicLabelTokens(label);
  const evidenceTokenSet = evidenceTokens([
    ...(context.evidenceTexts ?? []),
    ...(context.candidateLabels ?? []),
  ]);
  const groundedTokenCount = meaningfulTokens.filter((token) =>
    evidenceTokenSet.has(semanticTokenFamily(token)),
  ).length;
  const reasons: string[] = [];

  if (normalized.length === 0 || meaningfulTokens.length === 0) {
    reasons.push("label has no meaningful topic words");
  }
  if (isMetaTopicLabel(label, providerLabels)) {
    reasons.push("label is a source or UI meta label");
  }
  if (topicLabelWordCount(label) > 4) {
    reasons.push("label is longer than four words");
  }
  if (
    topicLabelTokens(label).some((token) => headlineClauseTokens.has(token))
  ) {
    reasons.push("label is a headline clause instead of a topic noun phrase");
  }
  if (hasRepeatedTopicToken(label)) {
    reasons.push("label repeats the same topic word");
  }
  if (hasTruncatedContractionToken(label)) {
    reasons.push("label contains a truncated sentence contraction");
  }
  if (isUnderspecifiedProductArtifactLabel(label)) {
    reasons.push("label names a product and generic artifact without purpose");
  }
  if (meaningfulTokens.length === 1 && !hasConcreteSingleTokenSignal(label)) {
    reasons.push("single-word label is not a concrete entity signal");
  }
  if (evidenceTokenSet.size > 0) {
    const requiredGroundedTokens = Math.min(2, meaningfulTokens.length);
    if (groundedTokenCount < requiredGroundedTokens) {
      reasons.push("label is not grounded in collected evidence");
    }
  }

  const phraseScore = Math.min(0.22, meaningfulTokens.length * 0.055);
  const groundingScore =
    meaningfulTokens.length === 0
      ? 0
      : (groundedTokenCount / meaningfulTokens.length) * 0.24;
  const entityScore = hasConcreteSingleTokenSignal(label) ? 0.14 : 0;
  const accepted = reasons.length === 0;

  return {
    accepted,
    label,
    score: accepted
      ? roundQualityScore(0.42 + phraseScore + groundingScore + entityScore)
      : 0,
    meaningfulTokens,
    groundedTokenCount,
    reasons,
  };
};

export const meaningfulTopicLabelTokens = (value: string): readonly string[] =>
  normalizeTopicLabel(value)
    .split(/\s+/u)
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+$/u.test(token))
    .filter((token) => !isWeakTopicLabelToken(token));

export const isWeakTopicLabelToken = (value: string): boolean => {
  const normalized = normalizeTopicLabel(value);

  return (
    normalized.length === 0 ||
    weakTopicLabelTokens.has(normalized) ||
    genericActionTokens.has(normalized)
  );
};

export const hasConcreteSingleTokenSignal = (value: string): boolean => {
  const compact = compactLabel(value);

  return (
    /\b[A-Z]{2,}\b/u.test(compact) ||
    /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/u.test(compact) ||
    /[0-9+#./-]/u.test(compact) ||
    /^[A-Z][a-z0-9+#./-]{2,}$/u.test(compact)
  );
};

export const sanitizeTopicId = (
  value: string | undefined,
): string | undefined => {
  const compact = compactId(value);

  return compact === undefined || isWeakTopicId(compact) ? undefined : compact;
};

export const sanitizeTopicLabel = (
  value: string | undefined,
): string | undefined => {
  const compact = compactOptional(value);

  return compact === undefined || isWeakTopicLabel(compact)
    ? undefined
    : compact;
};

const isMetaTopicLabel = (
  label: string,
  providerLabels: readonly string[],
): boolean => {
  const normalized = normalizeTopicLabel(label);
  if (metaTopicLabels.has(normalized)) {
    return true;
  }

  return providerLabels
    .map(normalizeTopicLabel)
    .some((providerLabel) => providerLabel === normalized);
};

const evidenceTokens = (values: readonly string[]): ReadonlySet<string> =>
  new Set(
    values.flatMap((value) =>
      meaningfulTopicLabelTokens(value).map(semanticTokenFamily),
    ),
  );

const semanticTokenFamily = (token: string): string =>
  token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;

const topicLabelTokens = (value: string): readonly string[] =>
  normalizeTopicLabel(value).split(/\s+/u).filter(Boolean);

const topicLabelWordCount = (value: string): number =>
  value.split(/\s+/u).filter(Boolean).length;

const hasRepeatedTopicToken = (value: string): boolean => {
  const tokens = topicLabelTokens(value).filter(
    (token) => !isWeakTopicLabelToken(token),
  );

  return new Set(tokens).size < tokens.length;
};

const hasTruncatedContractionToken = (value: string): boolean =>
  topicLabelTokens(value).some((token) =>
    /^(?:aren|couldn|didn|doesn|don|hadn|hasn|haven|isn|shouldn|wasn|weren|won|wouldn)$/u.test(
      token,
    ),
  );

const isUnderspecifiedProductArtifactLabel = (value: string): boolean => {
  const tokens = topicLabelTokens(value);

  return (
    tokens.length >= 2 &&
    genericArtifactTokens.has(tokens.at(-1) ?? "") &&
    tokens.slice(0, -1).every((token) => broadProductFamilyTokens.has(token))
  );
};

const roundQualityScore = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
