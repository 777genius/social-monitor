import type { ReaderSummaryClaimQualityReport } from "./reader-summary-claim-quality";
import type { ProviderCount } from "./reader-summary-quality-eval-support";
import type { CollectionIntegrityStatus } from "./yesterday-social-replay-support";

export type ReaderSummaryQualityDashboardReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-quality-dashboard-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "persisted-reader-summary-multi-day-quality-gate";
    readonly rawPostTextPersistedInReport: false;
    readonly rawUserFeedbackPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly dayCount: number;
    readonly cleanDayCount: number;
    readonly dirtyDayCount: number;
  };
  readonly aggregate: {
    readonly latestCleanDate?: string;
    readonly cleanBlockingPassed: boolean;
    readonly degradedCleanDates: readonly string[];
    readonly dirtyDates: readonly string[];
    readonly plannerRolloutProof: PlannerRolloutProofReport;
    readonly averageCleanCrossSourceClusterRate: number;
    readonly averageCleanTopReadProviderSkew: number;
    readonly averageCleanUnexplainedTopReadRate: number;
    readonly averageCleanLowConfidenceWithoutRiskRate: number;
    readonly totalPrimaryCollected: Record<string, number>;
    readonly totalPrimarySelected: Record<string, number>;
    readonly totalPrimaryTopReads: Record<string, number>;
  };
  readonly days: readonly ReaderSummaryQualityDayReport[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

export type ReaderSummaryQualityDayReport = {
  readonly collectionDate: string;
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly scope: {
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
  };
  readonly feed: {
    readonly collectedFeedItemCount: number;
    readonly providerCounts: readonly ProviderCount[];
    readonly interestCount: number;
  };
  readonly summary: ReaderSummaryQualitySummaryReport;
  readonly topReadQuality: TopReadQualityReport;
  readonly claimQuality: ReaderSummaryClaimQualityReport;
  readonly collectionStrategy: CollectionStrategyReport;
  readonly feedbackShadow: FeedbackShadowReport;
  readonly qualityGates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

export type ReaderSummaryQualitySummaryReport = {
  readonly artifactStatus: "present" | "missing";
  readonly artifactFingerprint?: string;
  readonly confidenceLevel: "none" | "low" | "medium" | "high";
  readonly confidenceScore: number;
  readonly selectedFeedItemCount: number;
  readonly storyClusterCount: number;
  readonly crossSourceClusterRate: number;
  readonly topReadCount: number;
  readonly lowConfidenceTopReadCount: number;
  readonly lowConfidenceTopReadRate: number;
  readonly technicalLeakCount: number;
  readonly topReadProviderSkew: number;
  readonly primarySelectedCounts: Record<string, number>;
  readonly primaryTopReadCounts: Record<string, number>;
};

export type CollectionStrategyReport = {
  readonly primarySources: Record<string, PrimarySourceStrategyReport>;
  readonly plannerCanary: PlannerCanaryReport;
  readonly gates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
};

export type FeedbackShadowReport = {
  readonly mode: "shadow_no_ranking_influence";
  readonly ratingCount: number;
  readonly negativeRatingCount: number;
  readonly positiveRatingCount: number;
  readonly negativeReasonCounts: Record<string, number>;
  readonly providerNegativeRates: readonly {
    readonly providerKey: string;
    readonly ratingCount: number;
    readonly negativeRate: number;
  }[];
  readonly queryNegativeRates: readonly {
    readonly queryFingerprint: string;
    readonly ratingCount: number;
    readonly negativeRate: number;
  }[];
  readonly sourceNegativeRates: readonly {
    readonly sourceFingerprint: string;
    readonly ratingCount: number;
    readonly negativeRate: number;
  }[];
  readonly negativeTopReadMatchCount: number;
  readonly positiveTopReadMatchCount: number;
  readonly badProviderFingerprints: readonly string[];
  readonly badQueryFingerprints: readonly string[];
  readonly badSourceFingerprints: readonly string[];
  readonly rankingScoreAlignment: {
    readonly status:
      | "no_feedback"
      | "insufficient_matched_feedback"
      | "aligned"
      | "attention_needed";
    readonly matchedTopReadRatingCount: number;
    readonly averageMatchedTopReadSignalScore: number;
    readonly averageNegativeTopReadSignalScore: number;
    readonly averagePositiveTopReadSignalScore: number;
    readonly negativeHighScoreRatingCount: number;
    readonly positiveHighScoreRatingCount: number;
  };
  readonly gates: Record<string, boolean>;
};

export type TopReadQualityReport = {
  readonly rowCount: number;
  readonly unexplainedTopReadCount: number;
  readonly unexplainedTopReadRate: number;
  readonly lowConfidenceWithoutRiskCount: number;
  readonly lowConfidenceWithoutRiskRate: number;
  readonly weakTopReadOutrankingStrongSocialCount: number;
  readonly weakTopReadOutrankingStrongSocialRate: number;
  readonly selectionSignalCounts: Record<string, number>;
  readonly riskSignalCounts: Record<string, number>;
  readonly reliabilityRiskCounts: Record<string, number>;
  readonly providerContribution: readonly TopReadProviderContribution[];
  readonly rows: readonly TopReadQualityRow[];
  readonly gates: Record<string, boolean>;
};

export type TopReadProviderContribution = {
  readonly providerKey: string;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly selectedShare: number;
  readonly topReadShare: number;
  readonly topReadLift: number;
};

export type TopReadQualityRow = {
  readonly index: number;
  readonly providerKey: string;
  readonly sourceFingerprint: string;
  readonly signalScore: number;
  readonly confidenceLevel: "low" | "medium" | "high";
  readonly citationCount: number;
  readonly confirmedProviderCount: number;
  readonly matchedRuleCount: number;
  readonly providerMetricCount: number;
  readonly selectionSignals: readonly string[];
  readonly riskSignals: readonly string[];
};

export type PrimarySourceStrategyReport = {
  readonly collectedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly interestCount: number;
  readonly collectedForEveryInterest: boolean;
  readonly minCollectedPerInterest: number;
  readonly sourceBindingCount: number;
  readonly queryLaneCount: number;
  readonly productLaneCount: number;
  readonly eligibleTopReadCandidateCount: number;
  readonly readerFacingTopReadCandidateCount: number;
  readonly sourceSkewRatio: number;
  readonly topSourceFingerprints: readonly string[];
};

export type PlannerCanaryReport = {
  readonly mode: "shadow_config_preview";
  readonly primarySources: Record<string, PlannerCanarySourceReport>;
  readonly gates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
};

export type PlannerCanarySourceReport = {
  readonly bindingCount: number;
  readonly canaryEnabledBindingCount: number;
  readonly plannedLaneCount: number;
  readonly executableLaneCount: number;
  readonly executedLaneCount: number;
  readonly observedLaneFingerprintCount: number;
  readonly plannedBudget: number;
  readonly compiledAppliedCount: number;
  readonly compiledSearchQueryCount: number;
  readonly compiledScanPassCount: number;
  readonly collectedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly lanes: readonly PlannerCanaryLaneReport[];
  readonly executedLaneFingerprints: readonly string[];
  readonly warnings: readonly string[];
};

export type PlannerRolloutProofReport = {
  readonly status:
    | "ready"
    | "missing_clean_collection"
    | "missing_clean_rollout_proof";
  readonly latestEligibleCleanDate?: string;
  readonly eligibleCleanDates: readonly string[];
  readonly blockedDates: readonly PlannerRolloutProofDateReport[];
  readonly gates: Record<string, boolean>;
};

export type PlannerRolloutProofDateReport = {
  readonly collectionDate: string;
  readonly cleanCollection: boolean;
  readonly redditLaneMetadataPresent: boolean;
  readonly xTwitterLaneMetadataPresent: boolean;
  readonly redditExecutedLaneCount: number;
  readonly xTwitterExecutedLaneCount: number;
  readonly reasons: readonly string[];
};

export type PlannerCanaryLaneReport = {
  readonly laneFingerprint: string;
  readonly kind: string;
  readonly operation: string;
  readonly maxItems: number;
  readonly queryFingerprint: string;
  readonly executionState: "executed" | "not_observable" | "not_seen_in_feed";
};
