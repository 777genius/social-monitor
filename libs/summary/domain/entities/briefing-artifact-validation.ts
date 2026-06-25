import type { BriefingEvidenceSelection } from '../value-objects/briefing-evidence-item';
import { assertBriefingScope } from '../value-objects/briefing-scope';
import type {
  BriefingArtifactProps,
  BriefingCitation,
  BriefingReaderBrief,
  BriefingReaderItem,
  GeneratedBriefingDraft,
} from './briefing-artifact';

export const assertBriefingArtifactValid = (
  props: BriefingArtifactProps,
): void => {
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
    assertCitedSection(
      story.title,
      story.summary,
      story.citationIds,
      citationIds,
      'Briefing top story',
    );
  }

  for (const highlight of props.topicHighlights) {
    if (highlight.topicId.trim().length === 0) {
      throw new Error('Briefing topic highlight topic id must be non-empty');
    }
    assertCitedSection(
      highlight.title,
      highlight.summary,
      highlight.citationIds,
      citationIds,
      'Briefing topic highlight',
    );
  }

  for (const signal of props.repeatedSignals) {
    assertClusterReference(
      signal.storyClusterId,
      clusterIds,
      'Briefing repeated signal',
    );
    assertCitedSection(
      signal.title,
      signal.title,
      signal.citationIds,
      citationIds,
      'Briefing repeated signal',
    );
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
};

export const assertBriefingCitationsAgainstEvidence = (
  draft: Pick<
    GeneratedBriefingDraft,
    | 'citationMap'
    | 'topStories'
    | 'topicHighlights'
    | 'repeatedSignals'
    | 'risksAndUnknowns'
  >,
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
    assertCitationIds(
      section.citationIds,
      knownCitationIds,
      'Briefing reader topic section',
    );
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
    assertCitationIds(
      action.citationIds,
      knownCitationIds,
      'Briefing reader next action',
    );
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
    item.signalScore < 0 ||
    item.confirmedProviderKeys.length === 0 ||
    !Number.isFinite(item.confidence.score) ||
    item.confidence.score < 0 ||
    item.confidence.score > 1 ||
    item.confidence.rationale.trim().length === 0
  ) {
    throw new Error(`${label} must include title, provider and reason`);
  }
  if (!['low', 'medium', 'high'].includes(item.confidence.level)) {
    throw new Error(`${label} confidence level is unsupported`);
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
