import type { ReaderActionKind } from "./reader-action";
import type { ProviderMetric } from "../value-objects/provider-metric-label";
import type { ProviderRanking } from "../value-objects/provider-ranking";
import type { PreviewMedia } from "../value-objects/preview-media";
import type { SignalScore } from "../value-objects/signal-score";

export type TopReadPrimaryActionKind = Extract<
  ReaderActionKind,
  "read_source" | "watch_repository"
>;

export type TopReadConfidence = {
  readonly level: "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export type TopRead = {
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
  readonly providerRanking?: ProviderRanking;
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
