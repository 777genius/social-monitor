import { fingerprint } from "./yesterday-social-replay-support";

export type RankingAuditTopRead = {
  readonly title: string;
  readonly providerKey: string;
  readonly signalScore: number;
  readonly confidence: {
    readonly level: string;
  };
  readonly confirmedProviderKeys: readonly string[];
  readonly citationIds: readonly string[];
  readonly reason?: string;
  readonly whyImportant?: readonly string[];
  readonly matchedRules?: readonly string[];
  readonly publishedAt?: string;
  readonly canonicalUrl?: string;
};

export type MissedSameProviderCandidate = {
  readonly providerKey: string;
  readonly selectedPostRank: number;
  readonly candidateSignalScore: number;
  readonly weakestTopReadSignalScore: number;
  readonly signalDelta: number;
  readonly candidateSupportScore: number;
  readonly weakestTopReadSupportScore: number;
  readonly candidateTopicScore: number;
  readonly weakestTopReadTopicScore: number;
  readonly explanation: "topic_tradeoff" | "unexplained";
  readonly candidateFingerprint: string;
  readonly weakestTopReadFingerprint: string;
};

const defaultSameProviderMissedCandidateSignalGap = 0.25;
const defaultSevereSameProviderMissedCandidateSignalGap = 0.5;
const defaultSupportExplanationMargin = 0.4;

export const materialSameProviderMissedCandidates = (params: {
  readonly topReads: readonly RankingAuditTopRead[];
  readonly selectedPosts: readonly RankingAuditTopRead[];
  readonly signalGap?: number;
}): readonly MissedSameProviderCandidate[] => {
  const topReadKeys = new Set(params.topReads.map(topReadIdentity));
  const topReadsByProvider = groupByProvider(params.topReads);
  const misses: MissedSameProviderCandidate[] = [];
  const signalGap =
    params.signalGap ?? defaultSameProviderMissedCandidateSignalGap;

  params.selectedPosts.forEach((candidate, index) => {
    if (topReadKeys.has(topReadIdentity(candidate))) {
      return;
    }

    const providerTopReads =
      topReadsByProvider.get(candidate.providerKey) ?? [];
    const weakestTopRead = weakestBySignal(providerTopReads);
    if (weakestTopRead === undefined) {
      return;
    }

    const signalDelta = candidate.signalScore - weakestTopRead.signalScore;
    if (signalDelta < signalGap) {
      return;
    }
    const candidateTopicScore = coreTopicScore(candidate);
    const weakestTopReadTopicScore = coreTopicScore(weakestTopRead);

    misses.push({
      providerKey: candidate.providerKey,
      selectedPostRank: index + 1,
      candidateSignalScore: rounded(candidate.signalScore),
      weakestTopReadSignalScore: rounded(weakestTopRead.signalScore),
      signalDelta: rounded(signalDelta),
      candidateSupportScore: rankingSupportScore(candidate),
      weakestTopReadSupportScore: rankingSupportScore(weakestTopRead),
      candidateTopicScore,
      weakestTopReadTopicScore,
      explanation:
        weakestTopReadTopicScore >= candidateTopicScore + 2
          ? "topic_tradeoff"
          : "unexplained",
      candidateFingerprint: rankingItemFingerprint(candidate),
      weakestTopReadFingerprint: rankingItemFingerprint(weakestTopRead),
    });
  });

  return misses.sort(
    (left, right) =>
      right.signalDelta - left.signalDelta ||
      right.candidateSupportScore - left.candidateSupportScore ||
      left.selectedPostRank - right.selectedPostRank,
  );
};

export const severeSameProviderMissedCandidates = (
  misses: readonly MissedSameProviderCandidate[],
  options: {
    readonly signalGap?: number;
    readonly supportExplanationMargin?: number;
  } = {},
): readonly MissedSameProviderCandidate[] => {
  const signalGap =
    options.signalGap ?? defaultSevereSameProviderMissedCandidateSignalGap;
  const supportExplanationMargin =
    options.supportExplanationMargin ?? defaultSupportExplanationMargin;

  return misses.filter(
    (miss) =>
      miss.explanation === "unexplained" &&
      miss.signalDelta >= signalGap &&
      miss.candidateSupportScore + supportExplanationMargin >=
        miss.weakestTopReadSupportScore,
  );
};

export function rankingSupportScore(item: RankingAuditTopRead): number {
  const providerSupport =
    item.confirmedProviderKeys.length > 1
      ? 3 + Math.min(item.confirmedProviderKeys.length, 4) * 0.35
      : 0;
  const confidenceSupport = confidenceRank(item.confidence.level) * 0.35;
  const citationSupport = Math.min(item.citationIds.length, 4) * 0.25;

  return rounded(providerSupport + confidenceSupport + citationSupport);
}

export function rankingItemFingerprint(item: RankingAuditTopRead): string {
  return fingerprint(
    [
      item.providerKey,
      item.canonicalUrl ?? "",
      item.title,
      item.publishedAt ?? "",
    ].join("|"),
  );
}

const groupByProvider = (
  items: readonly RankingAuditTopRead[],
): ReadonlyMap<string, readonly RankingAuditTopRead[]> => {
  const result = new Map<string, RankingAuditTopRead[]>();
  for (const item of items) {
    result.set(item.providerKey, [
      ...(result.get(item.providerKey) ?? []),
      item,
    ]);
  }

  return result;
};

const weakestBySignal = (
  items: readonly RankingAuditTopRead[],
): RankingAuditTopRead | undefined =>
  [...items].sort((left, right) => left.signalScore - right.signalScore)[0];

const topReadIdentity = (item: RankingAuditTopRead): string => {
  const canonicalUrl = item.canonicalUrl?.trim().toLowerCase();
  if (canonicalUrl !== undefined && canonicalUrl.length > 0) {
    return `url:${canonicalUrl}`;
  }

  return `fingerprint:${rankingItemFingerprint(item)}`;
};

const coreTopicScore = (item: RankingAuditTopRead): number => {
  const text = [
    item.title,
    item.reason,
    ...(item.whyImportant ?? []),
    ...(item.matchedRules ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/gu, " ");
  const phraseStrength = coreTopicPhrases.reduce(
    (total, phrase) => total + (text.includes(phrase) ? 1 : 0),
    0,
  );
  const tokenStrength = coreTopicTokenPattern.test(text) ? 2 : 0;
  const broadAiStrength = broadAiTopicPattern.test(text) ? 1 : 0;

  return Math.min(4, phraseStrength + tokenStrength + broadAiStrength);
};

const confidenceRank = (level: string): number => {
  switch (level.trim().toLowerCase()) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
};

const rounded = (value: number): number => Number(value.toFixed(3));

const coreTopicPhrases = [
  "ai generated code",
  "claude code",
  "model context protocol",
  "large language model",
  "ai agent",
  "ai agents",
  "coding agent",
  "coding agents",
  "developer tool",
  "developer tools",
  "prompt engineering",
  "typescript 7",
] as const;

const coreTopicTokenPattern =
  /\b(?:agentic|agents?|anthropic|chatgpt|claude|codex|cursor|developer|fable|github|gpt|llm|mcp|openai|programming|prompts?|repository|typescript|workflows?)\b/u;

const broadAiTopicPattern = /\b(?:ai|artificial intelligence)\b/u;
