import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";

const baselineTextLimit = 600;
const expandedCandidateLimit = 25;
const expandedSourceLimit = 2_500;
const sourceHydrationLimit = 50_000;
const relevantFragmentLimit = 780;
const maxRelevantFragments = 3;

export const buildAdaptiveReaderSummaryEvidence = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
  citationIdByFeedItemId?: ReadonlyMap<string, string>,
): readonly Record<string, unknown>[] => {
  const expandedIds = expandedEvidenceIds(selection, coveragePlan);

  return selection.selectedEvidence.map((item, index) =>
    promptEvidenceItem(
      item,
      index,
      expandedIds.has(item.feedItemId),
      citationIdByFeedItemId?.get(item.feedItemId) ?? `c${index + 1}`,
    ),
  );
};

const expandedEvidenceIds = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
): ReadonlySet<string> => {
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const result = new Set<string>();
  const add = (feedItemId: string): void => {
    const evidence = evidenceById.get(feedItemId);
    if (
      result.size < expandedCandidateLimit &&
      evidence !== undefined &&
      normalizeSourceText(evidence.sourceText ?? evidence.bodyPreview) !==
        undefined
    ) {
      result.add(feedItemId);
    }
  };

  for (const item of [coveragePlan.lead, ...coveragePlan.secondary]) {
    for (const feedItemId of item?.feedItemIds ?? []) {
      add(feedItemId);
    }
  }
  for (const item of [...selection.selectedEvidence].sort(compareCandidates)) {
    add(item.feedItemId);
  }

  return result;
};

const compareCandidates = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const eligibilityDifference =
    Number(isTopReadEligibleEvidence(right)) -
    Number(isTopReadEligibleEvidence(left));
  if (eligibilityDifference !== 0) {
    return eligibilityDifference;
  }
  const scoreDifference = right.score - left.score;
  return scoreDifference !== 0
    ? scoreDifference
    : right.publishedAt.getTime() - left.publishedAt.getTime();
};

const promptEvidenceItem = (
  item: SummaryEvidenceItem,
  index: number,
  expanded: boolean,
  citationId: string,
): Record<string, unknown> => {
  const baselineSource = item.sourceText ?? item.bodyPreview;

  return {
    index: index + 1,
    citationId,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    evidenceTier: expanded ? "expanded_candidate" : "baseline",
    title: compactText(item.title, baselineTextLimit),
    bodyPreview:
      baselineSource === undefined
        ? undefined
        : compactText(baselineSource, baselineTextLimit),
    sourceContent: expanded ? adaptiveSourceContent(item) : undefined,
    canonicalUrl: item.canonicalUrl,
    authorHandle: item.authorHandle,
    publishedAt: item.publishedAt.toISOString(),
    observedAt: item.observedAt.toISOString(),
    score: item.score,
    whyImportant: compactStringArray(item.whyImportant, 3, 160),
    contentQuality:
      item.contentQuality === undefined
        ? undefined
        : {
            decision: item.contentQuality.decision,
            reason: compactText(item.contentQuality.reason, 140),
            flags: item.contentQuality.flags.slice(0, 6),
            eligibleForTopRead: item.contentQuality.eligibleForTopRead,
            qualityScore: item.contentQuality.qualityScore,
            interestRelevanceScore: item.contentQuality.interestRelevanceScore,
            engagementIntegrityScore:
              item.contentQuality.engagementIntegrityScore,
          },
    conversationContext:
      item.conversationContext === undefined
        ? undefined
        : compactConversationContext(item.conversationContext),
  };
};

const adaptiveSourceContent = (
  item: SummaryEvidenceItem,
): Record<string, unknown> | undefined => {
  const source = normalizeSourceText(item.sourceText ?? item.bodyPreview);
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

const normalizeSourceText = (value: string | undefined): string | undefined => {
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

const compactConversationContext = (
  context: NonNullable<SummaryEvidenceItem["conversationContext"]>,
) => ({
  rankingBasis: context.rankingBasis,
  bundleScore: context.bundleScore,
  units: context.units.slice(0, 5).map((unit) => ({
    providerUnitId: unit.providerUnitId,
    authorHandle: unit.authorHandle,
    body: compactText(unit.body, 320),
    score: unit.score,
    providerScore: unit.providerScore,
    replyCount: unit.replyCount,
    signalBand: unit.signalBand,
    depth: unit.depth,
    role: unit.role,
    selectionReason: unit.selectionReason,
    ancestry: unit.ancestry?.slice(0, 2).map((ancestor) => ({
      providerUnitId: ancestor.providerUnitId,
      authorHandle: ancestor.authorHandle,
      body: compactText(ancestor.body, 220),
      score: ancestor.score,
      providerScore: ancestor.providerScore,
      replyCount: ancestor.replyCount,
      signalBand: ancestor.signalBand,
      depth: ancestor.depth,
      role: ancestor.role,
      selectionReason: ancestor.selectionReason,
    })),
  })),
});

const compactStringArray = (
  values: readonly string[],
  maxItems: number,
  maxLength: number,
): readonly string[] =>
  values.slice(0, maxItems).map((value) => compactText(value, maxLength));

const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};
