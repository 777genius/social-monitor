import {
  type JsonObject,
  type JsonValue,
  redactSensitiveText,
} from "@social-monitor/shared-kernel";

import type { SourceContentQualityInput } from "./source-content-quality";
import { extractSignalKeywords } from "./source-content-safety";

export type NormalizedSourceContentQualityInput = {
  readonly authorHandle?: string;
  readonly text: string;
  readonly topicTerms: readonly string[];
  readonly urlOnly: boolean;
  readonly tcoOnly: boolean;
  readonly lowInformationDensity: boolean;
  readonly mediaOnlyWithoutContext: boolean;
  readonly cryptoPromo: boolean;
  readonly engagementBait: boolean;
  readonly promoOffer: boolean;
  readonly genericQuestion: boolean;
  readonly predictionMarketRumor: boolean;
  readonly rumorOnly: boolean;
  readonly personalMedicalAnecdote: boolean;
  readonly weakTopicMatch: boolean;
  readonly missingTopicContext: boolean;
  readonly legacyCoreTopicSignal: boolean;
  readonly needsLinkContext: boolean;
};

export const normalizeSourceContentQualityInput = (
  input: SourceContentQualityInput,
): NormalizedSourceContentQualityInput => {
  const text = redactSensitiveText(
    `${input.title} ${input.bodyPreview ?? ""}`,
  ).trim();
  const textWithoutUrls = removeUrls(text);
  const tokens = tokenize(textWithoutUrls);
  const uniqueTokenCount = new Set(tokens).size;
  const hasUrl = urlPresencePattern.test(text);
  const tcoOnly =
    hasUrl &&
    tcoUrlPattern.test(text) &&
    textWithoutUrls.replace(/[^\p{L}\p{N}]+/giu, "").length === 0;
  const urlOnly = hasUrl && tokens.length < 4;
  const lowInformationDensity = tokens.length < 6 || uniqueTokenCount < 4;
  const mediaOnlyWithoutContext =
    urlOnly ||
    (/\b(?:watch|video|clip|demo|image|photo)\b/iu.test(textWithoutUrls) &&
      tokens.length < 8);
  const topicTerms = topicTermsFromMetadata(input.providerMetadata);
  const sourceCommunityTerms = sourceCommunityTermsFromMetadata(
    input.providerMetadata,
  );
  const weakTopicMatch =
    topicTerms.length > 0 &&
    !hasTopicMatch({
      topicTerms,
      textTokens: tokens,
      sourceCommunityTerms,
    });
  const missingTopicContext = topicTerms.length === 0;
  const legacyCoreTopicSignal = legacyCoreTopicSignalPattern.test(
    textWithoutUrls,
  );
  const cryptoPromo = cryptoPromoPattern.test(text);
  const promoOffer = promoOfferPattern.test(text);
  const engagementBait = engagementBaitPattern.test(text) || promoOffer;
  const predictionMarketRumor =
    predictionMarketPattern.test(text) &&
    rumorOrPoliticalClaimPattern.test(text);
  const rumorOnly =
    rumorOnlyPattern.test(text) && unreleasedAiModelPattern.test(text);
  const personalMedicalAnecdote =
    personalExperiencePattern.test(text) &&
    aiCodingToolPattern.test(text) &&
    medicalContextPattern.test(text);
  const genericQuestion =
    /\?\s*$/u.test(textWithoutUrls) &&
    /\b(?:what|which|who|why|how|кто|что|как|какой|какие)\b/iu.test(
      textWithoutUrls,
    );
  const needsLinkContext =
    (hasUrl && lowInformationDensity) ||
    (isTrustedXAuthor(input.authorHandle) && (urlOnly || tcoOnly));

  return {
    authorHandle: input.authorHandle,
    text,
    topicTerms,
    urlOnly,
    tcoOnly,
    lowInformationDensity,
    mediaOnlyWithoutContext,
    cryptoPromo,
    engagementBait,
    promoOffer,
    genericQuestion,
    predictionMarketRumor,
    rumorOnly,
    personalMedicalAnecdote,
    weakTopicMatch,
    missingTopicContext,
    legacyCoreTopicSignal,
    needsLinkContext,
  };
};

export const isXProvider = (providerKey: string): boolean => {
  const normalized = normalizeText(providerKey.trim());

  return (
    normalized === "x-twitter" || normalized === "twitter" || normalized === "x"
  );
};

export const isTrustedXAuthor = (value: string | undefined): boolean => {
  const normalized = value
    ?.trim()
    .replace(/^@/u, "")
    .toLocaleLowerCase("en-US");

  return normalized !== undefined && trustedXAuthors.has(normalized);
};

const topicTermsFromMetadata = (
  metadata: JsonObject | undefined,
): readonly string[] => {
  const interestQuerySnapshot = readObject(metadata?.interestQuerySnapshot);
  const sourceBindingSnapshot = readObject(metadata?.sourceBindingSnapshot);
  const sourceQuery = readObject(sourceBindingSnapshot?.sourceQuery);
  const searchQuery = readString(metadata?.searchQuery);
  const query = readString(metadata?.query);
  const interestQuery = readString(interestQuerySnapshot?.query);
  const sourceQueryText = readString(sourceQuery?.query);
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
    sourceQueryModeAllowsLiteralTerms(sourceQuery)
      ? sourceQueryText
      : undefined,
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

const sourceQueryModeAllowsLiteralTerms = (
  sourceQuery: JsonObject | undefined,
): boolean => {
  const mode = readString(sourceQuery?.mode)?.toLocaleLowerCase("en-US");

  return mode === undefined || mode !== "url";
};

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

const sourceCommunityTermsFromMetadata = (
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

const hasTopicMatch = (params: {
  readonly topicTerms: readonly string[];
  readonly textTokens: readonly string[];
  readonly sourceCommunityTerms: readonly string[];
}): boolean => {
  const textTokenSet = new Set(params.textTokens);
  const communityTokenSet = new Set(params.sourceCommunityTerms);
  const strongTopicTerms = params.topicTerms.filter(
    (term) => !isShortTopicTerm(term),
  );

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

const removeUrls = (value: string): string =>
  value.replace(urlPattern, " ").replace(/\s+/gu, " ").trim();

const tokenize = (value: string): readonly string[] =>
  normalizeText(value)
    .replace(/[^a-z0-9а-яё_ -]+/giu, " ")
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !stopWords.has(part));

const normalizeText = (value: string): string =>
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
const urlPresencePattern = /https?:\/\/\S+/iu;
const tcoUrlPattern = /https?:\/\/t\.co\/[a-z0-9_-]+/iu;
const cryptoPromoPattern =
  /\b(?:bingx|airdrop|crypto|web3|defi|trading|trade|token|coin|memecoin|giveaway|prize|rewards?)\b|\$[a-z]{2,12}\b/iu;
const engagementBaitPattern =
  /\b(?:drop\s+your|share\s+your|comment\s+below|reply\s+with|retweet|repost|like\s+and|follow\s+for|top\s+\d+|stop\s+wasting\s+hours?|i\s+have\s+already\s+done\s+it\s+for\s+you|with\s+one\s+list|zero\s+confusion|no\s+fluff)\b/iu;
const promoOfferPattern =
  /\b(?:all\s+paid\s+courses?|paid\s+courses?|free\s+courses?|free\s+for\s+(?:the\s+)?first|first\s+\d{2,6}\s+people|limited\s+spots?|claim\s+(?:your\s+)?free|course\s+giveaway|free\s+access)\b/iu;
const predictionMarketPattern =
  /\b(?:polymarket|kalshi|prediction\s+market|market\s+odds|betting\s+odds)\b/iu;
const rumorOrPoliticalClaimPattern =
  /\b(?:rumou?r|claim(?:s|ed)?|may|might|could|expected|odds?|administration|government|trump|biden|white\s+house|approval|restore|ban|allow)\b/iu;
const rumorOnlyPattern =
  /\b(?:rumou?r|claim(?:s|ed)?|alleged|leak(?:ed)?|early\s+tester|unreleased|expected|may|might|could)\b/iu;
const unreleasedAiModelPattern =
  /\b(?:gpt[-\s]?\d+(?:\.\d+)?|claude\s*\d+(?:\.\d+)?|gemini\s*\d+(?:\.\d+)?|early\s+tester|early\s+access|unreleased\s+model)\b/iu;
const personalExperiencePattern =
  /\b(?:i|me|my|mine|we|our|used|using|tried|story|experience)\b/iu;
const aiCodingToolPattern =
  /\b(?:claude\s+code|codex|cursor|copilot|ai\s+agent|coding\s+agent)\b/iu;
const medicalContextPattern =
  /\b(?:mri|ct\s+scan|scan|diagnos(?:is|e|ed)|doctor|medical|medicine|clinical|hospital|patient|cancer|tumou?r|symptom|therapy|treatment|prescription)\b/iu;
const legacyCoreTopicSignalPattern =
  /\b(?:ai|a\.i\.|artificial\s+intelligence|llm|llms|gpt|openai|anthropic|claude|codex|cursor|copilot|mcp|model|models|agentic|agent|agents|inference|token|tokens|neural|machine\s+learning|deep\s+learning|deepfake|cybersecurity|security|privacy|surveillance|geolocation|developer\s+tool|developer\s+tools|coding\s+agent|coding\s+agents|ai-generated\s+code|ai\s+code|vibe-coding)\b/iu;
const trustedXAuthors = new Set([
  "anthropicai",
  "gdb",
  "googledeepmind",
  "nvidiaai",
  "openai",
  "sama",
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
