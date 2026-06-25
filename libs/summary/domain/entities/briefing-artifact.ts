import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  BriefingSourceWindow,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import type { BriefingScope } from '../value-objects/briefing-scope';
import { assertBriefingArtifactValid } from './briefing-artifact-validation';

export { assertBriefingCitationsAgainstEvidence } from './briefing-artifact-validation';

export type BriefingQualityFlag =
  | 'no_signal'
  | 'low_confidence'
  | 'conflicting_evidence'
  | 'limited_sources'
  | 'partial_evidence'
  | 'context_unavailable'
  | 'provider_failed';

export type BriefingCitation = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: 'title' | 'bodyPreview' | 'canonicalUrl';
  readonly canonicalUrl?: string;
};

export type BriefingTopStory = {
  readonly storyClusterId: string;
  readonly title: string;
  readonly summary: string;
  readonly topicIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly citationIds: readonly string[];
};

export type BriefingTopicHighlight = {
  readonly topicId: string;
  readonly title: string;
  readonly summary: string;
  readonly citationIds: readonly string[];
};

export type BriefingRepeatedSignal = {
  readonly storyClusterId: string;
  readonly title: string;
  readonly topicIds: readonly string[];
  readonly citationIds: readonly string[];
};

export type BriefingRisk = {
  readonly description: string;
  readonly citationIds?: readonly string[];
  readonly reason?: 'insufficient_evidence' | 'conflicting_evidence' | 'source_limit' | 'provider_outage';
};

export type BriefingProviderMetric = {
  readonly label: string;
  readonly value: string;
};

export type BriefingReaderItemConfidence = {
  readonly level: 'low' | 'medium' | 'high';
  readonly score: number;
  readonly rationale: string;
};

export type BriefingReaderItem = {
  readonly title: string;
  readonly providerKey: string;
  readonly reason: string;
  readonly matchedTopicIds: readonly string[];
  readonly matchedRules: readonly string[];
  readonly signalScore: number;
  readonly confidence: BriefingReaderItemConfidence;
  readonly confirmedProviderKeys: readonly string[];
  readonly providerMetrics: readonly BriefingProviderMetric[];
  readonly whyImportant: readonly string[];
  readonly whyNow: string;
  readonly canonicalUrl?: string;
  readonly citationIds: readonly string[];
};

export type BriefingReaderTopicSection = {
  readonly topicId?: string;
  readonly title: string;
  readonly insight: string;
  readonly items: readonly BriefingReaderItem[];
  readonly citationIds: readonly string[];
};

export type BriefingSourceMixEntry = {
  readonly providerKey: string;
  readonly itemCount: number;
  readonly citationCount: number;
  readonly storyClusterCount: number;
  readonly crossSourceClusterCount: number;
  readonly singleSourceOnly: boolean;
  readonly topicIds: readonly string[];
};

export type BriefingTrendDelta = {
  readonly newSignals: readonly string[];
  readonly growingSignals: readonly string[];
  readonly repeatedSignals: readonly string[];
  readonly fadingSignals: readonly string[];
};

export type BriefingNextAction = {
  readonly kind:
    | 'read_source'
    | 'watch_repository'
    | 'monitor_topic'
    | 'compare_sources'
    | 'ignore_low_confidence'
    | 'add_topic_rule'
    | 'request_deeper_scan'
    | 'mark_relevant'
    | 'mark_not_relevant';
  readonly label: string;
  readonly reason: string;
  readonly citationIds: readonly string[];
  readonly canonicalUrl?: string;
};

export type BriefingReaderQualityState = {
  readonly status: 'ready' | 'partial' | 'limited_sources' | 'low_confidence' | 'no_signal' | 'failed_provider';
  readonly flags: readonly BriefingQualityFlag[];
  readonly warnings: readonly string[];
  readonly isSingleSource: boolean;
};

export type BriefingReaderBrief = {
  readonly headline: string;
  readonly oneLineTakeaway: string;
  readonly bullets: readonly string[];
  readonly qualityState: BriefingReaderQualityState;
  readonly topicSections: readonly BriefingReaderTopicSection[];
  readonly sourceMix: readonly BriefingSourceMixEntry[];
  readonly topReads: readonly BriefingReaderItem[];
  readonly trendDelta: BriefingTrendDelta;
  readonly openQuestions: readonly string[];
  readonly risks: readonly string[];
  readonly nextActions: readonly BriefingNextAction[];
};

export type BriefingContextArtifact = {
  readonly artifactId: string;
  readonly scope: BriefingScope;
  readonly summaryText: string;
  readonly generatedAt: Date;
  readonly freshness: 'fresh' | 'stale' | 'unknown';
};

export type BriefingLineage = {
  readonly promptVersion: string;
  readonly schemaVersion: 'briefing.artifact.v1';
  readonly modelVersion: string;
  readonly providerVersion: string;
  readonly rulesVersion: string;
  readonly evalDatasetVersion: string;
  readonly rankingPolicyVersion?: string;
};

export type BriefingUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export type BriefingConfidence = {
  readonly level: 'none' | 'low' | 'medium' | 'high';
  readonly score: number;
  readonly rationale: string;
};

export type BriefingArtifactProps = {
  readonly schemaVersion: 'briefing.artifact.v1';
  readonly briefingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly sourceWindow: BriefingSourceWindow;
  readonly storyClusters: readonly StoryCluster[];
  readonly contextArtifacts: readonly BriefingContextArtifact[];
  readonly headline: string;
  readonly executiveSummary: string;
  readonly readerBrief?: BriefingReaderBrief;
  readonly topStories: readonly BriefingTopStory[];
  readonly topicHighlights: readonly BriefingTopicHighlight[];
  readonly repeatedSignals: readonly BriefingRepeatedSignal[];
  readonly risksAndUnknowns: readonly BriefingRisk[];
  readonly citationMap: readonly BriefingCitation[];
  readonly qualityFlags: readonly BriefingQualityFlag[];
  readonly confidence: BriefingConfidence;
  readonly lineage: BriefingLineage;
  readonly usage: BriefingUsage;
  readonly noSignalReason?: string;
};

export type GeneratedBriefingDraft = Omit<
  BriefingArtifactProps,
  | 'schemaVersion'
  | 'briefingId'
  | 'tenantId'
  | 'workspaceId'
  | 'scope'
  | 'userId'
  | 'subscriptionId'
  | 'sourceWindow'
  | 'storyClusters'
  | 'contextArtifacts'
> & {
  readonly lineage: BriefingLineage;
  readonly usage: BriefingUsage;
};

export class BriefingArtifact {
  private constructor(private readonly props: BriefingArtifactProps) {}

  static create(props: BriefingArtifactProps): BriefingArtifact {
    assertBriefingArtifactValid(props);

    return new BriefingArtifact(props);
  }

  static rehydrate(props: BriefingArtifactProps): BriefingArtifact {
    assertBriefingArtifactValid(props);

    return new BriefingArtifact(props);
  }

  toSnapshot(): BriefingArtifactProps {
    return { ...this.props };
  }
}
