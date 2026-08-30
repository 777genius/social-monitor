import type { ReaderActionKind } from "./reader-action";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type { PreviewMedia } from "../value-objects/preview-media";
import type { SignalScore } from "../value-objects/signal-score";
import type {
  ReaderSummaryEditorialScoreComponents,
  ReaderSummaryEditorialSlateEntry,
} from
  "../value-objects/reader-summary-editorial-slate";

export type TopReadPrimaryActionKind = Extract<
  ReaderActionKind,
  "read_source" | "watch_repository"
>;

export type TopReadConfidence = {
  readonly level: "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export const readerSummaryCardKinds = [
  "curated_top_read",
  "additional_notable_story",
  "related_topic",
  "supplemental_trend",
  "unsupported",
] as const;

export type ReaderSummaryCardKind = (typeof readerSummaryCardKinds)[number];

export const readerPostPromotionCardFields = [
  "promotionMarker",
  "promotionPolicyVersion",
  "promotionTier",
  "promotionCandidateId",
  "promotionCanonicalIdentity",
] as const;

export type TopRead = {
  readonly storyClusterId?: string;
  readonly cardKind?: ReaderSummaryCardKind;
  readonly promotionMarker?: "reader_post_promotion";
  readonly promotionPolicyVersion?: "reader_post_promotion.v1";
  readonly promotionTier?: "top" | "additional";
  readonly promotionCandidateId?: string;
  readonly promotionCanonicalIdentity?: string;
  readonly editorialPolicyVersion?: ReaderSummaryEditorialSlateEntry["policyVersion"];
  readonly editorialPlacement?: "top" | "additional";
  readonly editorialSlot?: number;
  readonly editorialScoreComponents?: ReaderSummaryEditorialScoreComponents;
  readonly editorialReasonCodes?: readonly string[];
  readonly editorialCandidateDigestInput?: string;
  readonly editorialDigestInput?: string;
  readonly relationId?: string;
  readonly targetStoryClusterId?: string;
  readonly title: string;
  readonly providerKey: string;
  readonly providerName: string;
  readonly primaryActionKind: TopReadPrimaryActionKind;
  readonly reason: string;
  readonly matchedInterestIds: readonly string[];
  readonly matchedRules: readonly string[];
  readonly signalScore: SignalScore;
  readonly confidence: TopReadConfidence;
  readonly confirmedProviderKeys: readonly string[];
  readonly providerMetrics: readonly ProviderMetric[];
  readonly whyImportant: readonly string[];
  readonly whyNow: string;
  readonly publishedAt?: Date;
  readonly canonicalUrl?: string;
  readonly previewMedia?: PreviewMedia;
  readonly citationIds: readonly string[];
};

export type TopReadCandidate = {
  readonly storyClusterId: string;
  readonly title: string;
  readonly summary: string;
  readonly interestIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly citationIds: readonly string[];
};

export type InterestHighlight = {
  readonly interestId: string;
  readonly title: string;
  readonly summary: string;
  readonly citationIds: readonly string[];
};

export type RepeatedSignal = {
  readonly storyClusterId: string;
  readonly title: string;
  readonly interestIds: readonly string[];
  readonly citationIds: readonly string[];
};

export type ReaderSummaryRisk = {
  readonly description: string;
  readonly citationIds?: readonly string[];
  readonly reason?:
    | "insufficient_evidence"
    | "conflicting_evidence"
    | "source_limit"
    | "provider_outage";
};

export type ReaderInterestSection = {
  readonly interestId?: string;
  readonly title: string;
  readonly insight: string;
  readonly items: readonly TopRead[];
  readonly citationIds: readonly string[];
};

export type ReaderTrendDelta = {
  readonly newSignals: readonly string[];
  readonly growingSignals: readonly string[];
  readonly repeatedSignals: readonly string[];
  readonly fadingSignals: readonly string[];
};
