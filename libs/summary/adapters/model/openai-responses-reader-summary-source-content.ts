import type { SummaryEvidenceItem } from "../../domain";

const expandedSourceLimit = 2_500;
const relevantFragmentLimit = 780;
const maxRelevantFragments = 3;

export const adaptiveSourceContent = (
  item: SummaryEvidenceItem,
  sourceHydrationLimit: number,
): Record<string, unknown> | undefined => {
  const source = normalizeSourceText(item.sourceText ?? item.bodyPreview,
    sourceHydrationLimit);
  if (source === undefined) {
    return undefined;
  }
  const providerKey = item.providerKey.toLocaleLowerCase("en-US");
  const isSocial = providerKey === "x-twitter" || providerKey === "reddit";
  if (isSocial && source.length <= expandedSourceLimit) {
    return fullSourceContent("full_social_post", source);
  }
  if (source.length <= expandedSourceLimit) {
    return fullSourceContent("full_source_text", source);
  }

  const fragments = relevantSourceFragments(source, item);
  return {
    mode:
      providerKey === "rss" ? "rss_relevant_fragments" : "relevant_fragments",
    originalCharacterCount: source.length,
    includedCharacterCount: fragments.reduce(
      (total, fragment) => total + fragment.length,
      0,
    ),
    fragments,
  };
};

const fullSourceContent = (
  mode: "full_social_post" | "full_source_text",
  source: string,
) => ({
  mode,
  originalCharacterCount: source.length,
  includedCharacterCount: source.length,
  text: source,
});

const relevantSourceFragments = (
  source: string,
  item: SummaryEvidenceItem,
): readonly string[] => {
  const terms = sourceTerms(`${item.title} ${item.whyImportant.join(" ")}`);
  const chunks = sourceChunks(source);
  return chunks
    .map((text, index) => ({
      text,
      index,
      score: fragmentScore(text, terms, index),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxRelevantFragments)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.text);
};

const sourceChunks = (source: string): readonly string[] => {
  const sentences = source
    .split(/(?<=[.!?])\s+/u)
    .flatMap((sentence) => splitLongText(sentence, relevantFragmentLimit));
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length <= relevantFragmentLimit) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    current = sentence;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0
    ? chunks
    : [compactText(source, relevantFragmentLimit)];
};

const splitLongText = (value: string, limit: number): readonly string[] => {
  const remaining: string[] = [];
  let cursor = value.trim();
  while (cursor.length > limit) {
    const prefix = cursor.slice(0, limit);
    const boundary = prefix.lastIndexOf(" ");
    const end = boundary >= Math.floor(limit * 0.6) ? boundary : limit;
    remaining.push(cursor.slice(0, end).trim());
    cursor = cursor.slice(end).trim();
  }
  if (cursor.length > 0) {
    remaining.push(cursor);
  }
  return remaining;
};

const fragmentScore = (
  value: string,
  terms: ReadonlySet<string>,
  index: number,
): number => {
  const tokens = sourceTerms(value);
  let overlap = 0;
  for (const term of tokens) {
    if (terms.has(term)) {
      overlap += 1;
    }
  }
  const qualifierBoost =
    /\b(?:ultra|pro|max|preview|thinking|enterprise|plus)\b/iu.test(value)
      ? 4
      : 0;
  return overlap * 10 + qualifierBoost + 1 / (index + 1);
};

const sourceTerms = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .toLocaleLowerCase("en-US")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/u)
      .filter((part) => part.length >= 3)
      .filter((part) => !sourceStopWords.has(part)),
  );

const sourceStopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "that",
  "the",
  "this",
  "was",
  "with",
]);

export const normalizeSourceText = (value: string | undefined,
  sourceHydrationLimit: number): string | undefined => {
  const normalized = value
    ?.slice(0, sourceHydrationLimit)
    .replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)\s]+\s*\)/giu, "$1")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

export const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};
