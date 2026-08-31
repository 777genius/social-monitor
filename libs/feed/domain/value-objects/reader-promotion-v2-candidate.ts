export const READER_PROMOTION_POLICY_V2_VERSION =
  "reader_promotion_policy.v2" as const;
export const READER_PROMOTION_SOCIAL_METRIC_MAX_AGE_MS =
  6 * 60 * 60 * 1_000;

export type ReaderPromotionV2Provider =
  | "x"
  | "reddit"
  | "hacker_news"
  | "github";

export type ReaderPromotionV2ContentKind =
  | "original_post"
  | "story"
  | "repository";

export type ReaderPromotionV2ObservedMetrics =
  | {
      readonly provider: "x";
      readonly likes: number;
      readonly reposts: number;
      /** If supplied, it must equal likes + 2 * reposts. */
      readonly reportedSignal?: number;
    }
  | {
      readonly provider: "reddit";
      readonly score?: number;
      /** Provider-native alias. Conflicting score aliases fail closed. */
      readonly upvotes?: number;
      readonly upvoteRatio?: number;
    }
  | { readonly provider: "hacker_news"; readonly points: number }
  | {
      readonly provider: "github";
      readonly window: "24h";
      /** Must match the durable GitHub radar window end and authority time. */
      readonly checkedAt: string;
      readonly starsDelta: number;
      readonly forksDelta: number;
    };

export type ReaderPromotionV2Engagement =
  | { readonly state: "missing" | "malformed" | "conflict" }
  | {
      readonly state: "observed";
      readonly authoritative: boolean;
      readonly authority?: {
        readonly source: "durable_projection" | "github_checked_at";
        readonly observedAt: string;
        readonly regressionState:
          | "stable"
          | "confirmed_correction"
          | "unresolved_regression";
      };
      readonly metrics: ReaderPromotionV2ObservedMetrics;
    };

/** Hard admission decisions are deliberately separate from ranking inputs. */
export type ReaderPromotionV2HardAdmission = {
  readonly relevanceFloorMet: boolean;
  readonly qualityFloorMet: boolean;
  readonly integrityFloorMet: boolean;
  readonly safetyFloorMet: boolean;
  readonly freshnessFloorMet: boolean;
};

export type ReaderPromotionV2Candidate = {
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly provider: ReaderPromotionV2Provider;
  readonly contentKind: ReaderPromotionV2ContentKind;
  /** Canonical UTC ISO-8601 timestamp used only as a stable tie-break. */
  readonly publishedAt: string;
  /** Explicit immutable cutoff for engagement authority and replay. */
  readonly engagementCutoffAt: string;
  readonly admission: ReaderPromotionV2HardAdmission;
  readonly engagement: ReaderPromotionV2Engagement;
  readonly relevanceScore: number;
  readonly evidenceQualityScore: number;
  readonly integrityScore: number;
  readonly freshnessScore: number;
};

export type ReaderPromotionV2RejectionReason =
  | "identity_missing"
  | "publication_time_malformed"
  | "score_malformed"
  | "content_kind_not_admitted"
  | "relevance_floor_not_met"
  | "quality_floor_not_met"
  | "integrity_floor_not_met"
  | "safety_floor_not_met"
  | "freshness_floor_not_met"
  | "engagement_missing"
  | "engagement_malformed"
  | "engagement_conflict"
  | "engagement_unauthoritative"
  | "engagement_authority_missing"
  | "engagement_authority_malformed"
  | "engagement_observed_after_cutoff"
  | "engagement_stale"
  | "engagement_regression_unresolved"
  | "provider_floor_not_met";

export type ReaderPromotionV2ScoreComponents = {
  readonly engagementSalience: number;
  readonly relevance: number;
  readonly evidenceQuality: number;
  readonly integrity: number;
  readonly freshness: number;
  readonly weightedEngagement: number;
  readonly weightedRelevance: number;
  readonly weightedEvidenceQuality: number;
  readonly weightedIntegrity: number;
  readonly weightedFreshness: number;
  readonly total: number;
};

export type ReaderPromotionV2TieBreak = {
  readonly totalScore: number;
  readonly engagementSalience: number;
  readonly providerSignal: number;
  readonly publishedAt: string;
  readonly canonicalIdentity: string;
  readonly candidateId: string;
};

export type ReaderPromotionV2AdmissionAttestation = {
  readonly relevance: { readonly minimum: 0.5; readonly passed: boolean };
  readonly quality: { readonly minimum: 0.55; readonly passed: boolean };
  readonly integrity: { readonly minimum: 0.5; readonly passed: boolean };
  readonly safety: { readonly passed: boolean };
  readonly freshness: { readonly passed: boolean };
  readonly provider: {
    readonly admissionFloor: number;
    readonly topFloor: number;
    readonly passed: boolean;
  };
};

export type ReaderPromotionV2EngagementAttestation = {
  readonly state: "observed";
  readonly authoritative: true;
  readonly signalMethod:
    | "likes_plus_two_reposts"
    | "reddit_score_or_upvotes"
    | "hacker_news_points"
    | "max_stars_or_half_forks_24h";
  readonly providerSignal: number;
  readonly providerTopFloor: number;
  readonly relativePopularity: number;
  readonly engagementSalience: number;
  readonly authoritySource: "durable_projection" | "github_checked_at";
  readonly metricsObservedAt: string;
  readonly freshnessCutoffAt: string;
  readonly maximumAgeMs?: number;
  readonly regressionState: "stable" | "confirmed_correction";
};

export type AdmittedReaderPromotionV2 = {
  readonly admitted: true;
  readonly policyVersion: typeof READER_PROMOTION_POLICY_V2_VERSION;
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly provider: ReaderPromotionV2Provider;
  readonly providerSignal: number;
  readonly providerTopFloor: number;
  readonly relativePopularity: number;
  readonly components: ReaderPromotionV2ScoreComponents;
  readonly admissionAttestation: ReaderPromotionV2AdmissionAttestation;
  readonly engagementAttestation: ReaderPromotionV2EngagementAttestation;
  readonly tieBreak: ReaderPromotionV2TieBreak;
  /** Canonical, field-ordered input for a later persistence digest. */
  readonly digestInput: string;
};

export type RejectedReaderPromotionV2 = {
  readonly admitted: false;
  readonly policyVersion: typeof READER_PROMOTION_POLICY_V2_VERSION;
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly reasons: readonly ReaderPromotionV2RejectionReason[];
};

export type ReaderPromotionV2Evaluation =
  AdmittedReaderPromotionV2 | RejectedReaderPromotionV2;

export type ReaderPromotionV2Ranking = {
  readonly policyVersion: typeof READER_PROMOTION_POLICY_V2_VERSION;
  readonly ranked: readonly AdmittedReaderPromotionV2[];
  readonly rejected: readonly RejectedReaderPromotionV2[];
  readonly orderedCandidateIds: readonly string[];
  readonly orderedCanonicalIdentities: readonly string[];
  readonly digestInputs: readonly string[];
};
