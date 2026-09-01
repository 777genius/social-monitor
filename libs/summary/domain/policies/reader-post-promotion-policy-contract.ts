import { READER_PROMOTION_PROVIDER_ALIASES } from
  "@social-monitor/shared-kernel";
import type { ReaderSummaryEditorialScoreComponents } from
  "../value-objects/reader-summary-editorial-slate";

export const READER_POST_PROMOTION_POLICY_VERSION =
  "reader_post_promotion.v1" as const;
export const READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1 =
  "reader_post_promotion_attestation.v1" as const;
export const READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION =
  "reader_post_promotion_attestation.v2" as const;
export const READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION =
  "reader_post_promotion.v2" as const;
export const READER_POST_PROMOTION_DIGEST_V1 =
  "reader_post_promotion_digest.sha256.v1" as const;
export const READER_POST_PROMOTION_DIGEST_VERSION =
  "reader_post_promotion_digest.sha256.v2" as const;

export type ReaderPostPromotionDecision =
  | "promote_top"
  | "promote_additional"
  | "support_only"
  | "context_only"
  | "reject";

export type ReaderPostPromotionReason =
  | "top_engagement_floor_met"
  | "additional_engagement_floor_met"
  | "authoritative_same_story_support"
  | "support_window_mismatch"
  | "support_provider_not_independent"
  | "non_authoritative_relation"
  | "related_topic_context"
  | "unsupported_provider"
  | "wrong_content_kind"
  | "non_original_content"
  | "invalid_publication_time"
  | "outside_period"
  | "invalid_observation_time"
  | "observed_after_cutoff"
  | "stale_evidence"
  | "invalid_quality_score"
  | "quality_gate_failed"
  | "safety_gate_failed"
  | "citation_gate_failed"
  | "canonical_identity_missing"
  | "metrics_missing"
  | "metrics_malformed"
  | "metrics_conflict"
  | "engagement_floor_not_met"
  | "invalid_relation";

export type ReaderPostProvider =
  | "x"
  | "reddit"
  | "hacker_news"
  | "github_radar";

export type ReaderPostContentKind =
  | "original_post"
  | "story"
  | "repository"
  | "comment"
  | "reply"
  | "quote"
  | "github_trending"
  | "unknown";

export type ReaderPostProviderMetrics =
  | {
      readonly provider: "x";
      readonly likes: number;
      readonly reposts: number;
      readonly weightedScore: number;
    }
  | {
      readonly provider: "reddit";
      readonly score: number;
      readonly upvoteRatio?: number;
    }
  | { readonly provider: "hacker_news"; readonly points: number }
  | {
      readonly provider: "github_radar";
      readonly snapshotKind: "repository_growth";
      readonly windowStartedAt: Date;
      readonly windowEndedAt: Date;
      readonly starsDelta: number;
      readonly forksDelta: number;
    };

export type ReaderPostPromotionRelation = {
  readonly kind: "same_story" | "related_topic" | "heuristic";
  readonly targetCanonicalIdentity: string;
  readonly confidence: number;
  readonly approved: boolean;
};

export type ReaderPostPromotionInput = {
  readonly candidateId: string;
  readonly provider: string;
  readonly contentKind: ReaderPostContentKind;
  readonly canonicalIdentity: string;
  readonly citationId: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly exactPublishedAt?: string;
  readonly exactObservedAt?: string;
  readonly exactPeriodStart?: string;
  readonly exactPeriodEnd?: string;
  readonly exactIngestionCutoff?: string;
  readonly checkedAt?: Date;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly ingestionCutoff: Date;
  readonly freshnessValid: boolean;
  readonly qualityScore: number;
  readonly relevanceScore: number;
  readonly integrityScore: number;
  readonly qualityValid: boolean;
  readonly safetyValid: boolean;
  readonly citationValid: boolean;
  readonly authorityAttestation?: {
    readonly status: "attested";
    readonly official: boolean;
    readonly trusted: boolean;
    readonly attestedBy: "producer" | "source_catalog";
  };
  /** Legacy quality hints are retained for decoding only and never grant authority. */
  readonly officialAccount?: boolean;
  readonly trustedAuthor?: boolean;
  readonly metricsState?: "observed" | "missing" | "malformed" | "conflict";
  readonly metrics?: ReaderPostProviderMetrics;
  readonly relation?: ReaderPostPromotionRelation;
  readonly whyImportant?: string;
  readonly clusterId?: string;
};

export type ReaderPostPromotionResult = {
  readonly policyVersion: typeof READER_POST_PROMOTION_POLICY_VERSION;
  readonly candidateId: string;
  readonly canonicalIdentity: string;
  readonly decision: ReaderPostPromotionDecision;
  readonly reason: ReaderPostPromotionReason;
  readonly normalizedStrength: number;
  readonly authoritativeSameStory: boolean;
};

type ReaderPostPromotionAttestationBody = {
  readonly policyVersion: typeof READER_POST_PROMOTION_POLICY_VERSION;
  readonly digest: string;
  readonly canonicalPayload: string;
  readonly artifactId: string;
  readonly sourceWindowId: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly ingestionCutoff: Date;
  readonly placement: "top" | "additional";
  readonly slot: number;
  readonly candidateId: string;
  readonly provider: string;
  readonly contentKind: ReaderPostContentKind;
  readonly canonicalIdentity: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly exactPublishedAt?: string;
  readonly exactObservedAt?: string;
  readonly exactPeriodStart?: string;
  readonly exactPeriodEnd?: string;
  readonly exactIngestionCutoff?: string;
  readonly checkedAt?: Date;
  readonly citationId: string;
  readonly freshnessValid: boolean;
  readonly qualityScore: number;
  readonly relevanceScore: number;
  readonly integrityScore: number;
  readonly qualityValid: boolean;
  readonly safetyValid: boolean;
  readonly citationValid: boolean;
  readonly metricsState: "observed" | "missing" | "malformed" | "conflict";
  readonly metrics?: ReaderPostProviderMetrics;
  readonly authorityAttestation?: ReaderPostPromotionInput["authorityAttestation"];
  readonly tier: "top" | "additional" | "support" | "context" | "rejected";
  readonly decision: ReaderPostPromotionDecision;
  readonly reason: ReaderPostPromotionReason;
  readonly usefulnessComponents: {
    readonly normalizedStrength: number;
    readonly qualityScore: number;
    readonly interestRelevanceScore: number;
    readonly engagementIntegrityScore: number;
    readonly freshness: number;
    readonly total: number;
  };
  readonly relationTrace?: ReaderPostPromotionRelation;
  readonly supportFacts: readonly ReaderPostPromotionInput[];
  readonly citationIds: readonly string[];
  readonly providerCount: number;
  readonly confidence: number;
  readonly canonicalDedupeOutcome: "retained" | "deduplicated" | "not_applicable";
  readonly capOutcome: "selected" | "excluded_by_cap" | "not_applicable";
};

export type ReaderPostPromotionAttestationV1 =
  ReaderPostPromotionAttestationBody & {
    readonly schemaVersion: typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_V1;
    readonly policyVersion: typeof READER_POST_PROMOTION_POLICY_VERSION;
    readonly digestVersion: typeof READER_POST_PROMOTION_DIGEST_V1;
  };

export type ReaderPostPromotionEvidenceLineage = {
  readonly leadCandidateId: string;
  readonly leadCitationId: string;
  readonly supportCandidateIds: readonly string[];
  readonly supportCitationIds: readonly string[];
  readonly citationIds: readonly string[];
};

export type ReaderPostPromotionAttestationV2 = Omit<
  ReaderPostPromotionAttestationBody,
  "policyVersion"
> & {
  readonly schemaVersion: typeof READER_POST_PROMOTION_ATTESTATION_SCHEMA_VERSION;
  readonly policyVersion: typeof READER_POST_PROMOTION_ATTESTATION_POLICY_VERSION;
  readonly digestVersion: typeof READER_POST_PROMOTION_DIGEST_VERSION;
  readonly storyClusterId: string;
  readonly scoreComponents: ReaderSummaryEditorialScoreComponents;
  readonly reasonCodes: readonly string[];
  readonly candidateDigestInput: string;
  readonly slateEntryDigestInput: string;
  readonly slateDigestInput: string;
  readonly slateDigest: string;
  readonly evidenceLineage: ReaderPostPromotionEvidenceLineage;
};

export type ReaderPostPromotionAttestation =
  | ReaderPostPromotionAttestationV1
  | ReaderPostPromotionAttestationV2;

const xFloors = Object.freeze({
  top: Object.freeze({ weighted: 70, likes: 30, reposts: 10 }),
  additional: Object.freeze({ weighted: 35, likes: 15, reposts: 7 }),
});
const redditFloors = Object.freeze({
  top: Object.freeze({ score: 50, trustedRatio: 0.6 }),
  additional: Object.freeze({ score: 25, trustedRatio: 0.55 }),
});
const hackerNewsFloors = Object.freeze({ topPoints: 50, additionalPoints: 25 });
const githubRadarFloors = Object.freeze({
  snapshotHours: Object.freeze([24, 48] as const),
  top: Object.freeze({ starsDelta: 50, forksDelta: 100 }),
  additional: Object.freeze({ starsDelta: 25, forksDelta: 50 }),
});

export const READER_POST_PROMOTION_POLICY_V1 = Object.freeze({
  version: READER_POST_PROMOTION_POLICY_VERSION,
  maxTop: 8,
  maxAdditional: 8,
  sameStoryConfidenceMinimum: 0.92,
  confidence: Object.freeze({ supportBoost: 0.05, maxSupportBoost: 0.15 }),
  additionalUsefulnessWeights: Object.freeze({
    normalizedStrength: 0.35,
    qualityScore: 0.25,
    interestRelevanceScore: 0.2,
    engagementIntegrityScore: 0.1,
    freshness: 0.1,
  }),
  floors: Object.freeze({
    x: xFloors,
    reddit: redditFloors,
    hackerNews: hackerNewsFloors,
    githubRadar: githubRadarFloors,
  }),
  contentKinds: Object.freeze({
    x: "original_post",
    reddit: "original_post",
    hacker_news: "story",
    github_radar: "repository",
  } satisfies Readonly<Record<ReaderPostProvider, ReaderPostContentKind>>),
  providerAliases: READER_PROMOTION_PROVIDER_ALIASES,
  metricFields: Object.freeze({
    x: Object.freeze(["provider", "likes", "reposts", "weightedScore"]),
    reddit: Object.freeze(["provider", "score", "upvoteRatio"]),
    hacker_news: Object.freeze(["provider", "points"]),
    github_radar: Object.freeze([
      "provider",
      "snapshotKind",
      "windowStartedAt",
      "windowEndedAt",
      "starsDelta",
      "forksDelta",
    ]),
  }),
});
