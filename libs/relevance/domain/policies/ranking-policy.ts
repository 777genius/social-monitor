import type { JsonObject } from "@social-monitor/shared-kernel";

import type { UserRelevanceProfile } from "../entities/user-relevance-profile";
import {
  SourceContentQualityPolicy,
  type SourceContentQualityVerdict,
} from "../source-content-quality";
import {
  extractSignalKeywords,
  SourceContentSafetyPolicy,
  type SourceContentSafetyVerdict,
} from "../source-content-safety";

export type RankingCandidate = {
  readonly id: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly authorHandle?: string;
  readonly providerMetadata?: JsonObject;
  readonly publishedAt: Date;
  readonly sourceSignalScore: number;
  readonly contentQuality?: SourceContentQualityVerdict;
};

export type RankedRelevanceCandidate = {
  readonly candidate: RankingCandidate;
  readonly safety: SourceContentSafetyVerdict;
  readonly contentQuality: SourceContentQualityVerdict;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly clusterId: string;
  readonly duplicateCandidateIds: readonly string[];
  readonly clusterSize: number;
};

export type RankingMemoryPreference = {
  readonly key: string;
  readonly weight: number;
};

export type RankingMemoryGuidance = {
  readonly providerPreferences?: readonly RankingMemoryPreference[];
  readonly keywordPreferences?: readonly RankingMemoryPreference[];
  readonly mutedKeywords?: readonly string[];
  readonly blockedProviderKeys?: readonly string[];
};

type ScoredRelevanceCandidate = RankedRelevanceCandidate & {
  readonly titleTokens: readonly string[];
};

export class RankingPolicy {
  constructor(
    private readonly safetyPolicy = new SourceContentSafetyPolicy(),
    private readonly qualityPolicy = new SourceContentQualityPolicy(),
  ) {}

  rank(params: {
    readonly candidates: readonly RankingCandidate[];
    readonly profile: UserRelevanceProfile | null;
    readonly memoryGuidance?: RankingMemoryGuidance;
    readonly generatedAt: Date;
    readonly limit: number;
  }): readonly RankedRelevanceCandidate[] {
    const scored = params.candidates
      .map((candidate) =>
        this.scoreCandidate(
          candidate,
          params.profile,
          params.memoryGuidance,
          params.generatedAt,
        ),
      )
      .filter(
        (candidate): candidate is ScoredRelevanceCandidate =>
          candidate !== null,
      )
      .sort(compareScoredCandidates);

    return selectClusterWinners(scored, params.limit);
  }

  private scoreCandidate(
    candidate: RankingCandidate,
    profile: UserRelevanceProfile | null,
    memoryGuidance: RankingMemoryGuidance | undefined,
    now: Date,
  ): ScoredRelevanceCandidate | null {
    const safety = this.safetyPolicy.evaluate(candidate);
    const contentQuality =
      candidate.contentQuality ?? this.qualityPolicy.evaluate(candidate);
    const title = safety.sanitizedTitle;
    const bodyPreview = safety.sanitizedBodyPreview ?? "";
    const searchText = `${title} ${bodyPreview}`;

    if (
      safety.status === "blocked" ||
      !contentQuality.eligibleForSummary ||
      profile?.isProviderBlocked(candidate.providerKey) === true ||
      profile?.hasMutedKeyword(searchText) === true ||
      memoryGuidanceBlocksProvider(memoryGuidance, candidate.providerKey) ||
      memoryGuidanceMutesText(memoryGuidance, searchText)
    ) {
      return null;
    }

    const keywords = extractSignalKeywords(searchText);
    const interestWeight = profile?.interestWeight(candidate.interestId) ?? 0;
    const sourceWeight = profile?.sourceWeight(candidate.providerKey) ?? 0;
    const keywordScore = keywords.reduce(
      (total, keyword) => total + (profile?.keywordWeight(keyword) ?? 0),
      0,
    );
    const ageHours = Math.max(
      0,
      (now.getTime() - candidate.publishedAt.getTime()) / 3_600_000,
    );
    const recencyScore = Math.max(0, 0.5 - ageHours / 336);
    const sourceSignalScore = qualityAdjustedSourceSignalScore({
      sourceSignalScore: candidate.sourceSignalScore,
      contentQuality,
    });
    const memoryScore = memoryGuidanceScore({
      guidance: memoryGuidance,
      providerKey: candidate.providerKey,
      keywords,
    });
    const safetyPenalty = safety.status === "sanitized" ? -0.25 : 0;
    const score = roundScore(
      1 +
        interestWeight * 0.8 +
        sourceWeight * 0.7 +
        keywordScore * 0.35 +
        sourceSignalScore +
        memoryScore +
        recencyScore +
        safetyPenalty,
    );

    return {
      candidate,
      safety,
      contentQuality,
      score,
      whyImportant: buildWhyImportant({
        interestWeight,
        sourceWeight,
        keywordMatches: keywords.filter(
          (keyword) => (profile?.keywordWeight(keyword) ?? 0) > 0,
        ),
        sourceSignalScore,
        memoryScore,
        recencyScore,
        safety,
        contentQuality,
      }),
      clusterId: canonicalClusterKey(
        safety.sanitizedCanonicalUrl ?? candidate.canonicalUrl,
        title,
      ),
      titleTokens: titleTokens(title),
      duplicateCandidateIds: [],
      clusterSize: 1,
    };
  }
}

const selectClusterWinners = (
  candidates: readonly ScoredRelevanceCandidate[],
  limit: number,
): readonly RankedRelevanceCandidate[] => {
  const clusters: ScoredRelevanceCandidate[][] = [];

  for (const candidate of candidates) {
    const cluster = clusters.find((entry) =>
      belongsToCluster(candidate, entry[0]),
    );

    if (cluster === undefined) {
      clusters.push([candidate]);
    } else {
      cluster.push(candidate);
    }
  }

  const winners: ScoredRelevanceCandidate[] = [];

  for (const cluster of clusters) {
    const sortedCluster = cluster.sort(compareScoredCandidates);
    const winner = sortedCluster[0];

    if (winner === undefined) {
      continue;
    }

    const duplicates = sortedCluster.slice(1);
    winners.push({
      ...winner,
      duplicateCandidateIds: duplicates.map(
        (candidate) => candidate.candidate.id,
      ),
      clusterSize: cluster.length,
      whyImportant:
        cluster.length <= 1
          ? winner.whyImportant
          : [
              ...winner.whyImportant,
              `Clustered ${cluster.length} similar items`,
            ],
    });
  }

  return winners.sort(compareScoredCandidates).slice(0, limit);
};

const belongsToCluster = (
  candidate: ScoredRelevanceCandidate,
  clusterHead: ScoredRelevanceCandidate | undefined,
): boolean =>
  clusterHead !== undefined &&
  (candidate.clusterId === clusterHead.clusterId ||
    tokenSimilarity(candidate.titleTokens, clusterHead.titleTokens) >= 0.56);

const buildWhyImportant = (params: {
  readonly interestWeight: number;
  readonly sourceWeight: number;
  readonly keywordMatches: readonly string[];
  readonly sourceSignalScore: number;
  readonly memoryScore: number;
  readonly recencyScore: number;
  readonly safety: SourceContentSafetyVerdict;
  readonly contentQuality: SourceContentQualityVerdict;
}): readonly string[] => {
  const reasons = [];

  if (params.interestWeight > 0) {
    reasons.push("Matches a preferred interest");
  }

  if (params.sourceWeight > 0) {
    reasons.push("Comes from a preferred source");
  }

  if (params.keywordMatches.length > 0) {
    reasons.push(
      `Matches interest keywords: ${params.keywordMatches.slice(0, 3).join(", ")}`,
    );
  }

  if (params.sourceSignalScore >= 0.35) {
    reasons.push("Strong source engagement signal");
  }

  if (params.contentQuality.eligibleForTopRead) {
    reasons.push("Passes source quality and interest relevance gate");
  }

  if (params.contentQuality.decision === "downrank") {
    reasons.push(`Down-ranked by source quality gate: ${params.contentQuality.reason}`);
  }

  if (params.memoryScore > 0) {
    reasons.push("Matches memory preference");
  }

  if (params.memoryScore < 0) {
    reasons.push("Down-ranked by memory preference");
  }

  if (params.recencyScore > 0.25) {
    reasons.push("Fresh item in the current monitoring window");
  }

  if (params.safety.status === "sanitized") {
    reasons.push(
      "Unsafe source instructions were sandboxed before summarization",
    );
  }

  return reasons.length === 0 ? ["Relevant recent source item"] : reasons;
};

const compareScoredCandidates = (
  left: ScoredRelevanceCandidate,
  right: ScoredRelevanceCandidate,
): number => {
  const scoreDiff = right.score - left.score;

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return (
    right.candidate.publishedAt.getTime() - left.candidate.publishedAt.getTime()
  );
};

const canonicalClusterKey = (canonicalUrl: string, title: string): string => {
  try {
    const parsed = new URL(canonicalUrl);
    parsed.hash = "";
    parsed.search = "";

    return `url:${parsed.hostname.toLocaleLowerCase("en-US")}${parsed.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return `title:${titleTokens(title).join("-")}`;
  }
};

const tokenSimilarity = (
  left: readonly string[],
  right: readonly string[],
): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) =>
    rightSet.has(token),
  ).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
};

const titleTokens = (value: string): readonly string[] =>
  extractSignalKeywords(value).slice(0, 10);

const normalizeSourceSignalScore = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const qualityAdjustedSourceSignalScore = (params: {
  readonly sourceSignalScore: number;
  readonly contentQuality: SourceContentQualityVerdict;
}): number =>
  normalizeSourceSignalScore(params.sourceSignalScore) *
  params.contentQuality.qualityScore *
  params.contentQuality.interestRelevanceScore *
  params.contentQuality.engagementIntegrityScore;

const memoryGuidanceBlocksProvider = (
  guidance: RankingMemoryGuidance | undefined,
  providerKey: string,
): boolean =>
  new Set((guidance?.blockedProviderKeys ?? []).map(normalizeKey)).has(
    normalizeKey(providerKey),
  );

const memoryGuidanceMutesText = (
  guidance: RankingMemoryGuidance | undefined,
  searchText: string,
): boolean => {
  const normalizedText = searchText.toLocaleLowerCase("en-US");

  return (guidance?.mutedKeywords ?? []).some((keyword) => {
    const normalized = normalizeKey(keyword);

    return normalized.length > 0 && normalizedText.includes(normalized);
  });
};

const memoryGuidanceScore = (params: {
  readonly guidance: RankingMemoryGuidance | undefined;
  readonly providerKey: string;
  readonly keywords: readonly string[];
}): number => {
  const guidance = params.guidance;
  if (guidance === undefined) {
    return 0;
  }

  const providerWeight = preferenceWeight(
    guidance.providerPreferences,
    params.providerKey,
  );
  const keywordWeights = params.keywords.reduce(
    (total, keyword) =>
      total + preferenceWeight(guidance.keywordPreferences, keyword),
    0,
  );

  return clamp(providerWeight * 0.55 + keywordWeights * 0.2, -0.75, 0.75);
};

const preferenceWeight = (
  preferences: readonly RankingMemoryPreference[] | undefined,
  key: string,
): number => {
  const normalizedKey = normalizeKey(key);
  const preference = preferences?.find(
    (entry) => normalizeKey(entry.key) === normalizedKey,
  );

  return preference === undefined || !Number.isFinite(preference.weight)
    ? 0
    : preference.weight;
};

const normalizeKey = (value: string): string =>
  value.trim().toLocaleLowerCase("en-US");

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
