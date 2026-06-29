import type { ProviderMetric } from "./provider-metric-label";

export type SummaryEvidenceReaderActionKind =
  | "read_source"
  | "watch_repository";

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

export type SummaryEvidenceItem = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly providerName?: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly providerMetricLabels?: readonly ProviderMetric[];
  readonly providerMetricSummary?: string;
  readonly contentQuality?: SummaryEvidenceContentQuality;
  readonly readerActionKind?: SummaryEvidenceReaderActionKind;
  readonly matchedRules?: readonly string[];
  readonly storyKeyHint?: string;
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
};

export type SummaryEvidencePersonalization = {
  readonly memoryGuidanceStatus:
    | "disabled"
    | "available"
    | "empty"
    | "unavailable";
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
};
