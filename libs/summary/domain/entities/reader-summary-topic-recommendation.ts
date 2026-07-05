export type ReaderSummaryTopicTier = "core" | "adjacent" | "unknown";

export type ReaderSummaryTopicRecommendationKind =
  | "promote_adjacent_topic"
  | "observe_adjacent_topic";

export type ReaderSummaryTopicRecommendationDecisionStatus =
  | "pending"
  | "accepted"
  | "rejected";

export type ReaderSummaryTopicRecommendationMetrics = {
  readonly collectedPostCount: number;
  readonly summaryCount: number;
  readonly selectedEvidenceCount: number;
  readonly topReadCount: number;
  readonly citationCount: number;
  readonly crossSourceSummaryCount: number;
  readonly usefulSummaryCount: number;
  readonly duplicateEvidenceCount: number;
  readonly lowRelevanceSignalCount: number;
  readonly mutedSignalCount: number;
  readonly userRatedSignalCount: number;
  readonly selectionRate: number;
  readonly citationRate: number;
  readonly topReadRate: number;
  readonly duplicateRate: number;
  readonly noiseRate: number;
  readonly averageSignalScore: number;
};

export type ReaderSummaryTopicRecommendation = {
  readonly recommendationId: string;
  readonly kind: ReaderSummaryTopicRecommendationKind;
  readonly decisionStatus: ReaderSummaryTopicRecommendationDecisionStatus;
  readonly decidedAt?: Date;
  readonly decidedBy?: string;
  readonly decisionNote?: string;
  readonly topicLabel: string;
  readonly currentTier: ReaderSummaryTopicTier;
  readonly suggestedTier: ReaderSummaryTopicTier;
  readonly confidenceScore: number;
  readonly rationale: string;
  readonly windowDays: number;
  readonly metrics: ReaderSummaryTopicRecommendationMetrics;
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly evidenceReaderSummaryIds: readonly string[];
  readonly reasons: readonly string[];
};
