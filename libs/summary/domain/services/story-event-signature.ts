import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

export const STORY_EVENT_LEMMAS = [
  "acquire", "announce", "ban", "deploy", "disclose", "fund", "launch",
  "merge", "outage", "patch", "raise", "recall", "release", "reveal",
  "rollout", "ship", "sue", "watermark",
] as const;

export type StoryEventLemma = typeof STORY_EVENT_LEMMAS[number];

export type StoryEventSignature = Readonly<{
  titleTokens: readonly string[];
  strongAnchors: readonly string[];
  eventPredicates: readonly StoryEventLemma[];
  qualifiers: readonly string[];
}>;

export const storyEventSignature = (
  title: string,
): StoryEventSignature | undefined => {
  if (title.trim().length === 0) return undefined;
  const rawTokens = lexicalTokens(title);
  const titleTokens = uniqueSorted(rawTokens.map(({ normalized }) => normalized)
    .filter((token) => token.length >= 2 && !titleStopTokens.has(token)));
  const eventPredicates = uniqueSorted(rawTokens.flatMap(({ normalized }) => {
    const lemma = eventLemmaByForm.get(normalized);
    return lemma === undefined ? [] : [lemma];
  })) as readonly StoryEventLemma[];
  const strongAnchors = uniqueSorted(rawTokens.flatMap(({ raw, normalized }) =>
    isStrongAnchor(raw, normalized) ? [normalized] : []));
  const qualifiers = uniqueSorted(rawTokens.flatMap(({ normalized }) =>
    qualifierToken(normalized) ? [normalized] : []));
  return { titleTokens, strongAnchors, eventPredicates, qualifiers };
};

export const storyTitleSimilarity = (
  left: StoryEventSignature,
  right: StoryEventSignature,
): number => {
  const leftSet = new Set(left.titleTokens);
  const rightSet = new Set(right.titleTokens);
  const shared = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : shared / union;
};

export const sharedExactTokens = <T extends string>(
  left: readonly T[],
  right: readonly T[],
): readonly T[] => {
  const rightSet = new Set(right);
  return [...new Set(left.filter((token) => rightSet.has(token)))]
    .sort((leftToken, rightToken) => leftToken.localeCompare(rightToken));
};

export const speculativeQuestionClearedByBody = (
  item: SummaryEvidenceItem,
  signature: StoryEventSignature,
  actor: string,
  object: string,
  predicate: StoryEventLemma,
): boolean => {
  if (!isSpeculativeTitle(item.title)) return true;
  const body = [item.bodyPreview, item.sourceText]
    .filter((value): value is string => value !== undefined && value.trim() !== "")
    .join("\n");
  if (body.length === 0) return false;
  return body.split(/(?<=[.!])\s+|\n+/u).some((sentence) => {
    if (sentence.trim().length === 0 || isSpeculativeTitle(sentence) ||
        hasNegation(sentence)) return false;
    const bodySignature = storyEventSignature(sentence);
    if (bodySignature === undefined) return false;
    const tokens = new Set(bodySignature.titleTokens);
    return tokens.has(actor) && tokens.has(object) &&
      bodySignature.eventPredicates.includes(predicate) &&
      signature.qualifiers.every((qualifier) => tokens.has(qualifier));
  });
};

export const isSpeculativeTitle = (value: string): boolean => {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return normalized.endsWith("?") ||
    /^(?:are|can|could|did|do|does|has|have|is|may|might|should|was|were|will|would)\b/u
      .test(normalized) ||
    /\b(?:allegedly|could|may|might|prediction|predicts?|reportedly|rumou?r|speculat(?:e|es|ed|ing|ion))\b/u
      .test(normalized);
};

export const hasNegation = (value: string): boolean =>
  /\b(?:cannot|didn['’]?t|doesn['’]?t|hasn['’]?t|isn['’]?t|never|no|not|won['’]?t|without)\b/iu
    .test(value);

const lexicalTokens = (value: string): readonly Readonly<{
  raw: string;
  normalized: string;
}>[] => (value.normalize("NFKC")
  .match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}+#.-]*/gu) ?? [])
  .map((raw) => ({ raw, normalized: normalizeToken(raw) }));

const normalizeToken = (raw: string): string => {
  const token = raw.toLocaleLowerCase("en-US").replace(/^[.-]+|[.-]+$/gu, "");
  return eventLemmaByForm.get(token) ?? sameLemmaMorphology(token);
};

const sameLemmaMorphology = (token: string): string => {
  if (token.length > 6 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 6 && token.endsWith("ing")) {
    return token.slice(0, -3).replace(/(.)\1$/u, "$1");
  }
  if (token.length > 5 && token.endsWith("ed")) {
    return token.slice(0, -2).replace(/(.)\1$/u, "$1");
  }
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
};

const eventLemmaByForm = new Map<string, StoryEventLemma>([
  ["acquire", "acquire"], ["acquired", "acquire"], ["acquires", "acquire"],
  ["acquiring", "acquire"], ["acquisition", "acquire"],
  ["announce", "announce"], ["announced", "announce"],
  ["announces", "announce"], ["announcement", "announce"],
  ["ban", "ban"], ["banned", "ban"], ["bans", "ban"], ["banning", "ban"],
  ["deploy", "deploy"], ["deployed", "deploy"], ["deploying", "deploy"],
  ["deployment", "deploy"], ["deploys", "deploy"],
  ["disclose", "disclose"], ["disclosed", "disclose"],
  ["discloses", "disclose"], ["disclosure", "disclose"],
  ["fund", "fund"], ["funded", "fund"], ["funding", "fund"], ["funds", "fund"],
  ["launch", "launch"], ["launched", "launch"], ["launches", "launch"],
  ["launching", "launch"], ["merge", "merge"], ["merged", "merge"],
  ["merger", "merge"], ["merges", "merge"], ["merging", "merge"],
  ["outage", "outage"], ["outages", "outage"],
  ["patch", "patch"], ["patched", "patch"], ["patches", "patch"],
  ["patching", "patch"], ["raise", "raise"], ["raised", "raise"],
  ["raises", "raise"], ["raising", "raise"], ["recall", "recall"],
  ["recalled", "recall"], ["recalls", "recall"], ["recalling", "recall"],
  ["release", "release"], ["released", "release"], ["releases", "release"],
  ["releasing", "release"], ["reveal", "reveal"], ["revealed", "reveal"],
  ["reveals", "reveal"], ["revealing", "reveal"],
  ["rollout", "rollout"], ["rollouts", "rollout"], ["rolledout", "rollout"],
  ["ship", "ship"], ["shipped", "ship"], ["shipping", "ship"], ["ships", "ship"],
  ["sue", "sue"], ["sued", "sue"], ["sues", "sue"], ["suing", "sue"],
  ["watermark", "watermark"], ["watermarked", "watermark"],
  ["watermarking", "watermark"], ["watermarks", "watermark"],
]);

const isStrongAnchor = (raw: string, token: string): boolean =>
  token.length >= 3 && !strongAnchorExclusions.has(token) &&
  !eventLemmaByForm.has(raw.toLocaleLowerCase("en-US")) &&
  (/\p{Lowercase_Letter}\p{Uppercase_Letter}/u.test(raw) ||
    /[\p{Letter}][\p{Number}]|[\p{Number}][\p{Letter}]/u.test(raw) ||
    /^\p{Uppercase_Letter}/u.test(raw) ||
    knownStrongAnchors.has(token));

const qualifierToken = (token: string): boolean =>
  /^(?:v?\d+(?:\.\d+)*|20\d{2})$/u.test(token) ||
  qualifierWords.has(token);

const knownStrongAnchors = new Set([
  "anthropic", "claude", "codex", "cursor", "github", "google", "meta",
  "microsoft", "openai", "reddit", "spacex", "xai",
]);
const strongAnchorExclusions = new Set([
  "ai", "company", "companies", "technology", "technologies", "news",
  "update", "updates", "user", "users", "official", "report",
]);
const titleStopTokens = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on",
  "or", "the", "to", "with",
]);
const qualifierWords = new Set([
  "confirmed", "global", "production", "preview", "beta", "january", "february",
  "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december",
]);

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
