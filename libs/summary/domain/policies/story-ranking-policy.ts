export type StoryRankingPolicyVersion = "story_ranking_v1" | "story_ranking_v2";

export type StoryRankingEvalThresholds = {
  readonly minTopKOrderAccuracy: number;
  readonly maxFalseMergeRate: number;
  readonly maxFalseSplitRate: number;
  readonly minCrossProviderPreference: number;
};

export type StoryRankingFreshnessBoost = {
  readonly maxAgeHours: number;
  readonly boost: number;
};

export type StoryRankingPolicy = {
  readonly version: StoryRankingPolicyVersion;
  readonly maxClusters: number;
  readonly maxSelectedEvidencePerCluster: number;
  readonly maxCrossProviderEvidence: number;
  readonly crossProviderScoreWeight: number;
  readonly crossProviderContributionCap: number;
  readonly sameProviderDuplicateWeight: number;
  readonly sameProviderSupportCap: number;
  readonly providerDiversityWeight: number;
  readonly providerDiversityCap: number;
  readonly interestDiversityWeight: number;
  readonly interestDiversityCap: number;
  readonly freshnessBoosts: readonly StoryRankingFreshnessBoost[];
  readonly trustedStoryKeyHintPrefixes: readonly string[];
  readonly titleFingerprintMaxTokens: number;
  readonly semanticTopicMaxTokens: number;
  readonly crossSourceMinSharedTopicTokens: number;
  readonly crossSourceTopicSimilarityThreshold: number;
  readonly evalThresholds: StoryRankingEvalThresholds;
};

export const STORY_RANKING_POLICY_V1 = {
  version: "story_ranking_v2",
  maxClusters: 200,
  maxSelectedEvidencePerCluster: 4,
  maxCrossProviderEvidence: 3,
  crossProviderScoreWeight: 0.18,
  crossProviderContributionCap: 0.3,
  sameProviderDuplicateWeight: 0.1,
  sameProviderSupportCap: 0.24,
  providerDiversityWeight: 0.25,
  providerDiversityCap: 0.75,
  interestDiversityWeight: 0.12,
  interestDiversityCap: 0.36,
  freshnessBoosts: [
    { maxAgeHours: 6, boost: 0.18 },
    { maxAgeHours: 24, boost: 0.12 },
    { maxAgeHours: 72, boost: 0.06 },
  ],
  trustedStoryKeyHintPrefixes: ["url:", "github-repo:"],
  titleFingerprintMaxTokens: 10,
  semanticTopicMaxTokens: 10,
  crossSourceMinSharedTopicTokens: 3,
  crossSourceTopicSimilarityThreshold: 0.42,
  evalThresholds: {
    minTopKOrderAccuracy: 1,
    maxFalseMergeRate: 0,
    maxFalseSplitRate: 0,
    minCrossProviderPreference: 1,
  },
} as const satisfies StoryRankingPolicy;
