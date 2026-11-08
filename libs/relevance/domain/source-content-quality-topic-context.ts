import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";

import { extractSignalKeywords } from "./source-content-safety";

export const topicTermsFromMetadata = (
  metadata: JsonObject | undefined,
): readonly string[] => {
  const interestQuerySnapshot = readObject(metadata?.interestQuerySnapshot);
  const sourceBindingSnapshot = readObject(metadata?.sourceBindingSnapshot);
  const sourceQuery = readObject(sourceBindingSnapshot?.sourceQuery);
  const searchQuery = readString(metadata?.searchQuery);
  const query = readString(metadata?.query);
  const interestQuery = readString(interestQuerySnapshot?.query);
  // Acquisition descriptors are not topic intent. Gate once, before both
  // keyword/short-topic extraction and literal search-term extraction.
  const sourceQueryText = sourceQuery?.mode === "search"
    ? readString(sourceQuery.query)
    : undefined;
  const values = [
    searchQuery,
    query,
    interestQuery,
    sourceQueryText,
    readString(metadata?.topic),
    ...readStringArray(metadata?.topics),
  ].filter((value): value is string => value !== undefined);
  const literalSearchValues = [
    searchQuery,
    query,
    sourceQueryText,
  ].filter((value): value is string => value !== undefined);
  const terms = [
    ...values.flatMap((value) => [
      ...extractSignalKeywords(value),
      ...tokenize(value).filter((token) => shortTopicTerms.has(token)),
    ]),
    ...literalSearchValues.flatMap(literalTopicTermsFromSearchQuery),
  ];

  return uniqueStable(
    terms.filter(
      (term) =>
        !topicOperatorTerms.has(term) &&
        term.length > 0 &&
        !/^\d+$/u.test(term),
    ),
  );
};

const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readStringArray = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value)
    ? value
        .map((item) => readString(item))
        .filter((item): item is string => item !== undefined)
    : [];

const readObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== undefined &&
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

const literalTopicTermsFromSearchQuery = (value: string): readonly string[] => {
  if (urlPresencePattern.test(value) || value.length > 160) {
    return [];
  }

  return tokenize(value).filter(
    (token) =>
      !topicOperatorTerms.has(token) &&
      (token.length >= 3 ||
        shortTopicTerms.has(token) ||
        languageTopicTerms.has(token)),
  );
};

export const sourceCommunityTermsFromMetadata = (
  metadata: JsonObject | undefined,
): readonly string[] =>
  uniqueStable(
    [
      readString(metadata?.subreddit),
      readString(metadata?.community),
      readString(metadata?.channel),
      readString(metadata?.forum),
      ...communityDefaultsForMetadata(metadata),
    ]
      .filter((value): value is string => value !== undefined)
      .flatMap(communityTopicTerms),
  );

const communityDefaultsForMetadata = (
  metadata: JsonObject | undefined,
): readonly string[] => {
  const kind = readString(metadata?.kind)?.toLocaleLowerCase("en-US");
  const feedUrl = readString(metadata?.feedUrl)?.toLocaleLowerCase("en-US");

  if (kind === "hacker_news_story" || feedUrl?.includes("hnrss.org") === true) {
    return ["hacker news", "developer technology programming software"];
  }

  if (kind === "rss_item" && feedUrl?.includes("openai.com") === true) {
    return ["openai artificial intelligence model developer"];
  }

  if (kind === "rss_item" && feedUrl?.includes("github.blog") === true) {
    return ["github developer open source programming"];
  }

  if (kind === "rss_item" && feedUrl?.includes("cloudflare.com") === true) {
    return ["cloudflare infrastructure developer security"];
  }

  return [];
};

export const hasTopicMatch = (params: {
  readonly topicTerms: readonly string[];
  readonly textTokens: readonly string[];
  readonly sourceCommunityTerms: readonly string[];
}): boolean => {
  const textTokenSet = new Set(params.textTokens);
  const communityTokenSet = new Set(params.sourceCommunityTerms);
  const strongTopicTerms = params.topicTerms.filter(
    (term) => !isShortTopicTerm(term),
  );
  const topicIncludesAiFamily = params.topicTerms.some((term) =>
    topicTermVariants(term).some((variant) =>
      variant === "ai" || strongCoreTopicAliases.has(variant),
    ),
  );
  if (
    topicIncludesAiFamily &&
    [...textTokenSet].some((token) => strongCoreTopicAliases.has(token))
  ) {
    return true;
  }

  if (
    strongTopicTerms.some((term) =>
      topicTermVariants(term).some((variant) => textTokenSet.has(variant)),
    )
  ) {
    return true;
  }

  const shortTextMatch = params.topicTerms
    .filter(isShortTopicTerm)
    .some((term) =>
      topicTermVariants(term).some((variant) => textTokenSet.has(variant)),
    );

  if (!shortTextMatch) {
    return false;
  }

  if (strongTopicTerms.length === 0) {
    return true;
  }

  return strongTopicTerms.some((term) =>
    topicTermVariants(term).some((variant) => communityTokenSet.has(variant)),
  );
};

const topicTermVariants = (value: string): readonly string[] => {
  const normalized = normalizeText(value.trim());
  const aliases = topicTermAliases.get(normalized) ?? [];
  const variants = [normalized, ...aliases];

  return uniqueStable(variants);
};

const communityTopicTerms = (value: string): readonly string[] => {
  const split = splitCompactCommunityName(value);

  return uniqueStable([...extractSignalKeywords(split), ...tokenize(split)]);
};

const splitCompactCommunityName = (value: string): string =>
  value
    .replace(/[_-]+/gu, " ")
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2");

const isShortTopicTerm = (value: string): boolean =>
  shortTopicTerms.has(normalizeText(value.trim()));

export const removeUrls = (value: string): string =>
  value.replace(urlPattern, " ").replace(/\s+/gu, " ").trim();

export const tokenize = (value: string): readonly string[] =>
  normalizeText(value)
    .replace(/[^a-z0-9а-яё_ -]+/giu, " ")
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !stopWords.has(part));

export const normalizeText = (value: string): string =>
  value.toLocaleLowerCase("en-US");

const uniqueStable = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};

const urlPattern = /https?:\/\/\S+/giu;
export const urlPresencePattern = /https?:\/\/\S+/iu;

const strongCoreTopicAliases = new Set([
  "altman",
  "amodei",
  "anthropic",
  "chatgpt",
  "claude",
  "codex",
  "copilot",
  "cursor",
  "gpt",
  "llm",
  "llms",
  "mcp",
  "openai",
]);
const topicTermAliases = new Map<string, readonly string[]>([
  [
    "ai",
    [
      "artificial",
      "intelligence",
      "llm",
      "llms",
      "gpt",
      "chatgpt",
      "openai",
      "anthropic",
      "claude",
      "model",
      "models",
      "token",
      "tokens",
      "inference",
      "neural",
      "stochastic",
      "parrot",
      "parrots",
    ],
  ],
  [
    "coding",
    ["code", "programming", "software", "developer", "developers", "dev"],
  ],
  ["ml", ["machine", "learning"]],
  ["agent", ["agents"]],
  ["agents", ["agent"]],
  ["developer", ["developers", "dev", "software", "engineering"]],
  ["developers", ["developer", "dev", "software", "engineering"]],
  ["model", ["models"]],
  ["models", ["model"]],
  ["tool", ["tools"]],
  ["tools", ["tool"]],
  ["workflow", ["workflows"]],
  ["workflows", ["workflow"]],
  ["x", ["twitter"]],
]);
const shortTopicTerms = new Set(["ai", "ml", "x"]);
const languageTopicTerms = new Set(["go", "js", "ts"]);
const topicOperatorTerms = new Set(["and", "or", "not", "top", "latest"]);
const stopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "how",
  "the",
  "this",
  "that",
  "with",
  "you",
  "your",
  "как",
  "что",
  "это",
]);
