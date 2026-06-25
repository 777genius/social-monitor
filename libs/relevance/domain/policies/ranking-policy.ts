import type { UserRelevanceProfile } from "../entities/user-relevance-profile";
import {
  extractSignalKeywords,
  SourceContentSafetyPolicy,
  type SourceContentSafetyVerdict,
} from "../source-content-safety";

export type RankingCandidate = {
  readonly id: string;
  readonly topicId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly publishedAt: Date;
  readonly sourceSignalScore: number;
};

export type RankedRelevanceCandidate = {
  readonly candidate: RankingCandidate;
  readonly safety: SourceContentSafetyVerdict;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly clusterId: string;
  readonly duplicateCandidateIds: readonly string[];
  readonly clusterSize: number;
};

type ScoredRelevanceCandidate = RankedRelevanceCandidate & {
  readonly titleTokens: readonly string[];
};

export class RankingPolicy {
  constructor(
    private readonly safetyPolicy = new SourceContentSafetyPolicy(),
  ) {}

  rank(params: {
    readonly candidates: readonly RankingCandidate[];
    readonly profile: UserRelevanceProfile | null;
    readonly generatedAt: Date;
    readonly limit: number;
  }): readonly RankedRelevanceCandidate[] {
    const scored = params.candidates
      .map((candidate) =>
        this.scoreCandidate(candidate, params.profile, params.generatedAt),
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
    now: Date,
  ): ScoredRelevanceCandidate | null {
    const safety = this.safetyPolicy.evaluate(candidate);
    const title = safety.sanitizedTitle;
    const bodyPreview = safety.sanitizedBodyPreview ?? "";
    const searchText = `${title} ${bodyPreview}`;

    if (
      safety.status === "blocked" ||
      profile?.isProviderBlocked(candidate.providerKey) === true ||
      profile?.hasMutedKeyword(searchText) === true
    ) {
      return null;
    }

    const keywords = extractSignalKeywords(searchText);
    const topicWeight = profile?.topicWeight(candidate.topicId) ?? 0;
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
    const sourceSignalScore = normalizeSourceSignalScore(
      candidate.sourceSignalScore,
    );
    const safetyPenalty = safety.status === "sanitized" ? -0.25 : 0;
    const score = roundScore(
      1 +
        topicWeight * 0.8 +
        sourceWeight * 0.7 +
        keywordScore * 0.35 +
        sourceSignalScore +
        recencyScore +
        safetyPenalty,
    );

    return {
      candidate,
      safety,
      score,
      whyImportant: buildWhyImportant({
        topicWeight,
        sourceWeight,
        keywordMatches: keywords.filter(
          (keyword) => (profile?.keywordWeight(keyword) ?? 0) > 0,
        ),
        sourceSignalScore,
        recencyScore,
        safety,
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
  readonly topicWeight: number;
  readonly sourceWeight: number;
  readonly keywordMatches: readonly string[];
  readonly sourceSignalScore: number;
  readonly recencyScore: number;
  readonly safety: SourceContentSafetyVerdict;
}): readonly string[] => {
  const reasons = [];

  if (params.topicWeight > 0) {
    reasons.push("Matches a preferred topic");
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

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
