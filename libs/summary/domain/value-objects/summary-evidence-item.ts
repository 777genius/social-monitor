import type { ProviderMetric } from "./provider-metric-label";
import type { PreviewMedia } from "./preview-media";
import type { ReaderSummaryRelatedTopicRelationProps } from "./reader-summary-related-topic-relation";
import type { ReaderPostPromotionAttestation } from "../policies/reader-post-promotion-policy-contract";

export type SummaryEvidenceReaderActionKind =
  "read_source" | "watch_repository";

export type SummaryEvidenceContentQuality = {
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
  readonly engagementIntegrityScore: number;
  readonly eligibleForSummary: boolean;
  readonly eligibleForTopRead: boolean;
  readonly needsLlmReview: boolean;
  readonly decision: string;
  readonly flags: readonly string[];
  readonly reason: string;
};

export type SummaryEvidencePromotionMetrics =
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
  | {
      readonly provider: "hacker_news";
      readonly points: number;
    }
  | {
      readonly provider: "github_radar";
      readonly snapshotKind: "repository_growth";
      readonly windowStartedAt: Date;
      readonly windowEndedAt: Date;
      readonly starsDelta: number;
      readonly forksDelta: number;
    };

export type SummaryEvidencePromotionFacts = {
  readonly contentKind:
    | "original_post"
    | "story"
    | "repository"
    | "comment"
    | "reply"
    | "quote"
    | "github_trending"
    | "unknown";
  readonly canonicalIdentity: string;
  readonly checkedAt?: Date;
  readonly authorityAttestation?: {
    readonly status: "attested";
    readonly official: boolean;
    readonly trusted: boolean;
    readonly attestedBy: "producer" | "source_catalog";
  };
  /** Legacy LLM quality hints; promotion authority never reads these fields. */
  readonly officialAccount?: boolean;
  readonly trustedAuthor?: boolean;
  readonly safetyValid: boolean;
  readonly freshnessValid: boolean;
  readonly freshnessProvenance?:
    | { readonly status: "unknown" }
    | {
        readonly status: "observed";
        readonly publishedAt: Date;
        readonly observedAt: Date;
        readonly ingestionCutoff: Date;
        readonly exactPublishedAt?: string;
        readonly exactObservedAt?: string;
        readonly exactIngestionCutoff?: string;
      };
  readonly metricsState?: "observed" | "missing" | "malformed" | "conflict";
  readonly metrics?: SummaryEvidencePromotionMetrics;
};

export type SummaryEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly providerName?: string;
  readonly canonicalUrl: string;
  readonly sourceOriginUrl?: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly sourceText?: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly providerMetricLabels?: readonly ProviderMetric[];
  readonly providerMetricSummary?: string;
  readonly previewMedia?: PreviewMedia;
  readonly conversationContext?: SummaryEvidenceConversationContext;
  readonly contentQuality?: SummaryEvidenceContentQuality;
  readonly promotionFacts?: SummaryEvidencePromotionFacts;
  readonly readerActionKind?: SummaryEvidenceReaderActionKind;
  readonly matchedRules?: readonly string[];
  readonly storyKeyHint?: string;
};

export type SummaryEvidenceConversationContext = {
  readonly rankingBasis: "cohort_baseline_v1";
  readonly bundleScore: number;
  readonly units: readonly SummaryEvidenceConversationUnit[];
};

export type SummaryEvidenceConversationUnit = {
  readonly conversationUnitId: string;
  readonly providerUnitId: string;
  readonly parentProviderUnitId?: string;
  readonly threadExternalId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly score: number;
  readonly providerScore?: number;
  readonly replyCount?: number;
  readonly signalBand: string;
  readonly depth: number;
  readonly role: "top_level_comment" | "reply";
  readonly selectionReason: "ranked";
  readonly ancestry?: readonly SummaryEvidenceConversationAncestor[];
  readonly publishedAt: string;
};

export type SummaryEvidenceConversationAncestor = {
  readonly conversationUnitId: string;
  readonly providerUnitId: string;
  readonly parentProviderUnitId?: string;
  readonly threadExternalId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly score: number;
  readonly providerScore?: number;
  readonly replyCount?: number;
  readonly signalBand: string;
  readonly depth: number;
  readonly role: "top_level_comment" | "reply";
  readonly selectionReason: "ancestor_context";
  readonly publishedAt: string;
};

export type StoryCluster = {
  readonly id: string;
  readonly storyKey: string;
  readonly rankingPolicyVersion?: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds: readonly string[];
  readonly interestIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly score: number;
  readonly signalBreakdown?: StorySignalBreakdown;
  readonly observedAtRange: {
    readonly startedAt: Date;
    readonly endedAt: Date;
  };
  readonly whyImportant: readonly string[];
};

export type StorySignalBreakdown = {
  readonly baseScore: number;
  readonly crossProviderSupport: number;
  readonly sameProviderSupport: number;
  readonly providerDiversityBoost: number;
  readonly interestDiversityBoost: number;
  readonly freshnessBoost: number;
  readonly totalScore: number;
};

export type SummaryEvidenceSelection = {
  readonly rankingPolicyVersion: string;
  readonly personalization?: SummaryEvidencePersonalization;
  readonly sourceWindow: SummarySourceWindow;
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly relatedTopicRelations?: readonly RelatedTopicRelation[];
  readonly approvedSameStoryRelations?: readonly ApprovedSameStoryRelation[];
  readonly promotionAttestations?: readonly ReaderPostPromotionAttestation[];
};

export type ApprovedSameStoryRelation = {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly confidence: number;
};

export type RelatedTopicRelation = ReaderSummaryRelatedTopicRelationProps;

export type SummaryEvidencePersonalization = {
  readonly memoryGuidanceStatus:
    "disabled" | "available" | "empty" | "unavailable";
  readonly memoryGuidanceApplied: boolean;
  readonly providerPreferenceCount: number;
  readonly keywordPreferenceCount: number;
  readonly mutedKeywordCount: number;
  readonly blockedProviderCount: number;
  readonly signals: readonly string[];
};

export type SummarySourceWindow = {
  readonly windowId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly selectedFeedItemIds: readonly string[];
  readonly storyClusterIds: readonly string[];
  readonly periodStartedAt?: Date;
  readonly periodEndedAt?: Date;
  readonly ingestionCutoff?: Date;
};
