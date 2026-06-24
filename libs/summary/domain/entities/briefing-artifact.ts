import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  BriefingEvidenceSelection,
  BriefingSourceWindow,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import type { BriefingScope } from '../value-objects/briefing-scope';
import { assertBriefingScope } from '../value-objects/briefing-scope';

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

export type BriefingReaderItem = {
  readonly title: string;
  readonly providerKey: string;
  readonly reason: string;
  readonly matchedTopicIds: readonly string[];
  readonly matchedRules: readonly string[];
  readonly signalScore: number;
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
    this.assertValid(props);

    return new BriefingArtifact(props);
  }

  static rehydrate(props: BriefingArtifactProps): BriefingArtifact {
    this.assertValid(props);

    return new BriefingArtifact(props);
  }

  toSnapshot(): BriefingArtifactProps {
    return { ...this.props };
  }

  private static assertValid(props: BriefingArtifactProps): void {
    if (props.schemaVersion !== 'briefing.artifact.v1') {
      throw new Error('Unsupported briefing schema version');
    }

    if (props.briefingId.trim().length === 0) {
      throw new Error('Briefing id must be non-empty');
    }

    assertBriefingScope(props.scope);

    if ((props.userId ?? '').trim().length === 0 && props.subscriptionId !== undefined) {
      throw new Error('Subscription-scoped briefing must include user id');
    }

    if (props.sourceWindow.endedAt.getTime() <= props.sourceWindow.startedAt.getTime()) {
      throw new Error('Briefing source window end must be after start');
    }

    if (props.sourceWindow.storyClusterIds.length !== props.storyClusters.length) {
      throw new Error('Briefing source window must reference every story cluster');
    }

    const clusterIds = new Set(props.storyClusters.map((cluster) => cluster.id));
    const citationIds = assertCitations(props.citationMap);

    for (const cluster of props.storyClusters) {
      if (cluster.id.trim().length === 0 || cluster.representativeFeedItemId.trim().length === 0) {
        throw new Error('Briefing story cluster ids must be non-empty');
      }

      if (cluster.topicIds.length === 0 || cluster.providerKeys.length === 0) {
        throw new Error('Briefing story clusters must include topic and provider coverage');
      }
    }

    for (const story of props.topStories) {
      assertClusterReference(story.storyClusterId, clusterIds, 'Briefing top story');
      assertCitedSection(story.title, story.summary, story.citationIds, citationIds, 'Briefing top story');
    }

    for (const highlight of props.topicHighlights) {
      if (highlight.topicId.trim().length === 0) {
        throw new Error('Briefing topic highlight topic id must be non-empty');
      }
      assertCitedSection(highlight.title, highlight.summary, highlight.citationIds, citationIds, 'Briefing topic highlight');
    }

    for (const signal of props.repeatedSignals) {
      assertClusterReference(signal.storyClusterId, clusterIds, 'Briefing repeated signal');
      assertCitedSection(signal.title, signal.title, signal.citationIds, citationIds, 'Briefing repeated signal');
      if (signal.topicIds.length < 2) {
        throw new Error('Briefing repeated signal must cover at least two topics');
      }
    }

    for (const risk of props.risksAndUnknowns) {
      for (const citationId of risk.citationIds ?? []) {
        if (!citationIds.has(citationId)) {
          throw new Error('Briefing risk cites evidence outside citation map');
        }
      }
    }

    if (props.readerBrief !== undefined) {
      assertReaderBrief(props.readerBrief, citationIds);
    }

    for (const contextArtifact of props.contextArtifacts) {
      if (contextArtifact.artifactId.trim().length === 0 || contextArtifact.summaryText.trim().length === 0) {
        throw new Error('Briefing context artifact must include id and summary text');
      }
      assertBriefingScope(contextArtifact.scope);
    }

    if (props.topStories.length === 0 && !props.qualityFlags.includes('no_signal')) {
      throw new Error('No-signal briefing must include no_signal quality flag');
    }

    if (props.qualityFlags.includes('no_signal') && (props.noSignalReason ?? '').trim().length === 0) {
      throw new Error('No-signal briefing must include a reason');
    }

    if (props.usage.inputTokens < 0 || props.usage.outputTokens < 0 || props.usage.estimatedCostUsd < 0) {
      throw new Error('Briefing usage values must be non-negative');
    }

    if (props.confidence.score < 0 || props.confidence.score > 1) {
      throw new Error('Briefing confidence score must be between 0 and 1');
    }

    if (props.confidence.level === 'none' && !props.qualityFlags.includes('no_signal')) {
      throw new Error('No-confidence briefing must include no_signal quality flag');
    }

    if (props.confidence.rationale.trim().length === 0) {
      throw new Error('Briefing confidence rationale must be non-empty');
    }
  }
}

export const assertBriefingCitationsAgainstEvidence = (
  draft: Pick<GeneratedBriefingDraft, 'citationMap' | 'topStories' | 'topicHighlights' | 'repeatedSignals' | 'risksAndUnknowns'>,
  evidence: BriefingEvidenceSelection,
): void => {
  const selectedFeedItemIds = new Set(evidence.sourceWindow.selectedFeedItemIds);
  for (const selectedFeedItemId of selectedFeedItemIds) {
    if (!draft.citationMap.some((citation) => citation.feedItemId === selectedFeedItemId)) {
      continue;
    }
  }

  for (const citation of draft.citationMap) {
    if (!selectedFeedItemIds.has(citation.feedItemId)) {
      throw new Error(`Briefing citation ${citation.citationId} references evidence outside selection`);
    }
  }
};

const assertReaderBrief = (
  readerBrief: BriefingReaderBrief,
  knownCitationIds: ReadonlySet<string>,
): void => {
  if (
    readerBrief.headline.trim().length === 0 ||
    readerBrief.oneLineTakeaway.trim().length === 0 ||
    readerBrief.bullets.some((bullet) => bullet.trim().length === 0)
  ) {
    throw new Error('Briefing reader brief must include headline, takeaway and non-empty bullets');
  }

  for (const source of readerBrief.sourceMix) {
    if (
      source.providerKey.trim().length === 0 ||
      source.itemCount < 0 ||
      source.citationCount < 0 ||
      source.storyClusterCount < 0 ||
      source.crossSourceClusterCount < 0
    ) {
      throw new Error('Briefing reader source mix entries must include provider and non-negative counts');
    }
  }

  if (readerBrief.qualityState.warnings.some((warning) => warning.trim().length === 0)) {
    throw new Error('Briefing reader quality state warnings must be non-empty');
  }

  for (const section of readerBrief.topicSections) {
    if (section.title.trim().length === 0 || section.insight.trim().length === 0) {
      throw new Error('Briefing reader topic sections must include title and insight');
    }
    assertCitationIds(section.citationIds, knownCitationIds, 'Briefing reader topic section');
    for (const item of section.items) {
      assertReaderItem(item, knownCitationIds, 'Briefing reader topic item');
    }
  }

  for (const item of readerBrief.topReads) {
    assertReaderItem(item, knownCitationIds, 'Briefing reader top read');
  }

  for (const action of readerBrief.nextActions) {
    if (action.label.trim().length === 0 || action.reason.trim().length === 0) {
      throw new Error('Briefing reader next actions must include label and reason');
    }
    assertCitationIds(action.citationIds, knownCitationIds, 'Briefing reader next action');
  }
};

const assertReaderItem = (
  item: BriefingReaderItem,
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  if (
    item.title.trim().length === 0 ||
    item.providerKey.trim().length === 0 ||
    item.reason.trim().length === 0 ||
    item.whyNow.trim().length === 0 ||
    item.whyImportant.length === 0 ||
    item.matchedTopicIds.length === 0 ||
    item.matchedRules.length === 0 ||
    !Number.isFinite(item.signalScore) ||
    item.signalScore < 0
  ) {
    throw new Error(`${label} must include title, provider and reason`);
  }
  for (const metric of item.providerMetrics) {
    if (metric.label.trim().length === 0 || metric.value.trim().length === 0) {
      throw new Error(`${label} provider metrics must include label and value`);
    }
  }
  assertCitationIds(item.citationIds, knownCitationIds, label);
};

const assertCitationIds = (
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(`${label} cites evidence outside citation map`);
    }
  }
};

const assertCitations = (citations: readonly BriefingCitation[]): Set<string> => {
  const citationIds = new Set<string>();

  for (const citation of citations) {
    if (citation.citationId.trim().length === 0) {
      throw new Error('Briefing citation id must be non-empty');
    }

    if (citation.feedItemId.trim().length === 0) {
      throw new Error('Briefing citation feed item id must be non-empty');
    }

    if (citation.sourceItemId.trim().length === 0) {
      throw new Error('Briefing citation source item id must be non-empty');
    }

    if (citation.providerKey.trim().length === 0) {
      throw new Error('Briefing citation provider key must be non-empty');
    }

    if (citationIds.has(citation.citationId)) {
      throw new Error('Briefing citation ids must be unique');
    }

    citationIds.add(citation.citationId);
  }

  return citationIds;
};

const assertCitedSection = (
  title: string,
  summary: string,
  citationIds: readonly string[],
  knownCitationIds: ReadonlySet<string>,
  label: string,
): void => {
  if (title.trim().length === 0 || summary.trim().length === 0 || citationIds.length === 0) {
    throw new Error(`${label} must include title, summary and citations`);
  }

  for (const citationId of citationIds) {
    if (!knownCitationIds.has(citationId)) {
      throw new Error(`${label} cites evidence outside citation map`);
    }
  }
};

const assertClusterReference = (
  storyClusterId: string,
  knownClusterIds: ReadonlySet<string>,
  label: string,
): void => {
  if (!knownClusterIds.has(storyClusterId)) {
    throw new Error(`${label} references unknown story cluster`);
  }
};
