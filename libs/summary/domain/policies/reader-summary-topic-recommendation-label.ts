import { uniqueNonEmpty } from "../value-objects/summary-text";
import { isWeakTopicLabelToken } from "../services/reader-summary-topic-map-label-quality";

export const readerSummaryTopicRecommendationLabel = (params: {
  readonly label: string;
  readonly keywords?: readonly string[];
}): string => {
  const label = params.label.trim();
  const keywordLabel = topicQueryLabelFromKeywords(params.keywords ?? []);
  if (isNoisyTopicLabel(label)) {
    return keywordLabel ?? (label || "Topic");
  }

  if (!isTitleLikeTopicLabel(label)) {
    return label || "Topic";
  }

  return topicQueryLabelFromTitle(label) ?? keywordLabel ?? label;
};

export const readerSummaryTopicRecommendationQueryTokens = (
  value: string,
): readonly string[] =>
  uniqueNonEmpty(
    normalizeReaderSummaryTopicRecommendationLabel(value)
      .split(/\s+/u)
      .filter(isTopicQueryToken),
  ).slice(0, 4);

export const normalizeReaderSummaryTopicRecommendationLabel = (
  value: string,
): string =>
  value
    .trim()
    .toLowerCase()
    .replace(durationTokenPattern, " ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const isUsableReaderSummaryTopicRecommendationLabel = (
  value: string,
): boolean => {
  const normalized = normalizeReaderSummaryTopicRecommendationLabel(value);

  return (
    normalized.length > 0 &&
    normalized !== "topic" &&
    !isNoisyTopicLabel(value) &&
    readerSummaryTopicRecommendationQueryTokens(value).length > 0
  );
};

const isTitleLikeTopicLabel = (label: string): boolean => {
  const normalized = normalizeReaderSummaryTopicRecommendationLabel(label);
  const wordCount = normalized.split(/\s+/u).filter(Boolean).length;

  return wordCount >= 6 || label.length >= 48;
};

const isNoisyTopicLabel = (label: string): boolean => {
  const tokens = normalizeReaderSummaryTopicRecommendationLabel(label)
    .split(/\s+/u)
    .filter(Boolean);

  return (
    tokens.length === 0 ||
    tokens.every((token) => isWeakTopicLabelToken(token))
  );
};

const topicQueryLabelFromTitle = (label: string): string | null => {
  const withoutDurations = label.replace(durationTokenPattern, " ");
  const primaryFragment = withoutDurations.split(/[:|]+/u)[0]?.trim();

  for (const fragment of uniqueNonEmpty([
    primaryFragment ?? "",
    withoutDurations,
  ])) {
    const queryLabel = formatTopicQueryLabel(
      readerSummaryTopicRecommendationQueryTokens(fragment),
    );
    if (queryLabel !== null) {
      return queryLabel;
    }
  }

  return null;
};

const topicQueryLabelFromKeywords = (
  keywords: readonly string[],
): string | null =>
  formatTopicQueryLabel(
    readerSummaryTopicRecommendationQueryTokens(keywords.join(" ")),
  );

const isTopicQueryToken = (token: string): boolean =>
  (token.length >= 3 || topicTokenDisplayLabels.has(token)) &&
  !/^\d+$/u.test(token) &&
  !isWeakTopicLabelToken(token);

const formatTopicQueryLabel = (tokens: readonly string[]): string | null => {
  if (tokens.length === 0) {
    return null;
  }

  return tokens
    .map((token, index) => displayTopicToken(token, index))
    .join(" ");
};

const displayTopicToken = (token: string, index: number): string =>
  topicTokenDisplayLabels.get(token) ??
  (index === 0
    ? `${token.charAt(0).toLocaleUpperCase("en-US")}${token.slice(1)}`
    : token);

const durationTokenPattern =
  /\b\d+[-\s]*(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|month|months|year|years)\b/g;

const topicTokenDisplayLabels = new Map([
  ["ai", "AI"],
  ["api", "API"],
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["codex", "Codex"],
  ["cursor", "Cursor"],
  ["gemini", "Gemini"],
  ["github", "GitHub"],
  ["llm", "LLM"],
  ["mcp", "MCP"],
  ["openai", "OpenAI"],
  ["rss", "RSS"],
]);
