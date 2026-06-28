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
  readonly genericQuestion: boolean;
  readonly predictionMarketRumor: boolean;
  readonly rumorOnly: boolean;
  readonly personalMedicalAnecdote: boolean;
  readonly weakTopicMatch: boolean;
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
  const normalizedText = normalizeText(textWithoutUrls);
  const topicTerms = topicTermsFromMetadata(input.providerMetadata);
  const weakTopicMatch =
    topicTerms.length > 0 &&
    !topicTerms.some((term) => normalizedText.includes(term));
  const cryptoPromo = cryptoPromoPattern.test(text);
  const engagementBait = engagementBaitPattern.test(text);
  const predictionMarketRumor =
    predictionMarketPattern.test(text) && rumorOrPoliticalClaimPattern.test(text);
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
    genericQuestion,
    predictionMarketRumor,
    rumorOnly,
    personalMedicalAnecdote,
    weakTopicMatch,
    needsLinkContext,
  };
};

export const isXProvider = (providerKey: string): boolean => {
  const normalized = normalizeText(providerKey.trim());

  return (
    normalized === "x-twitter" ||
    normalized === "twitter" ||
    normalized === "x"
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
  const values = [
    readString(metadata?.searchQuery),
    readString(metadata?.topic),
    ...readStringArray(metadata?.topics),
  ].filter((value): value is string => value !== undefined);
  const terms = values.flatMap((value) => [
    ...extractSignalKeywords(value),
    ...tokenize(value).filter((token) => shortTopicTerms.has(token)),
  ]);

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
  /\b(?:drop\s+your|share\s+your|comment\s+below|reply\s+with|retweet|repost|like\s+and|follow\s+for|top\s+\d+)\b/iu;
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
const trustedXAuthors = new Set([
  "anthropicai",
  "gdb",
  "googledeepmind",
  "nvidiaai",
  "openai",
  "sama",
]);
const shortTopicTerms = new Set(["ai", "ml", "x"]);
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
