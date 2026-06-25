import type {
  BriefingCitation,
  BriefingNextAction,
  BriefingQualityFlag,
  BriefingReaderBrief,
  BriefingReaderItem,
  BriefingReaderQualityState,
  BriefingReaderTopicSection,
  BriefingRepeatedSignal,
  BriefingRisk,
  BriefingSourceMixEntry,
  BriefingTopStory,
  BriefingTopicHighlight,
} from '../entities/briefing-artifact';
import type {
  BriefingEvidenceItem,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import {
  buildMatchedRules,
  buildWhyNow,
  compactUnique,
  confirmedProviderKeys,
  firstSentence,
  formatStoryProviderMetrics,
  hasAnyCitation,
  nonEmpty,
  normalizeSignalScore,
  plural,
  providerLabel,
  readerItemConfidence,
  topicTitle,
  uniqueActions,
  uniqueItems,
  uniqueNonEmpty,
} from './briefing-reader-brief-support';
import {
  buildQualityState,
  buildSourceMix,
} from './briefing-reader-brief-quality';
import { uniqueReaderTopStories } from './briefing-reader-top-story-selection';

export type BriefingReaderBriefFactoryInput = {
  readonly headline: string;
  readonly executiveSummary: string;
  readonly topStories: readonly BriefingTopStory[];
  readonly topicHighlights: readonly BriefingTopicHighlight[];
  readonly repeatedSignals: readonly BriefingRepeatedSignal[];
  readonly risksAndUnknowns: readonly BriefingRisk[];
  readonly citationMap: readonly BriefingCitation[];
  readonly storyClusters: readonly StoryCluster[];
  readonly selectedEvidence?: readonly BriefingEvidenceItem[];
  readonly qualityFlags: readonly BriefingQualityFlag[];
  readonly noSignalReason?: string;
};

const maxReaderTopReads = 10;

export const buildBriefingReaderBrief = (
  input: BriefingReaderBriefFactoryInput,
): BriefingReaderBrief => {
  if (input.topStories.length === 0) {
    return buildNoSignalReaderBrief(input);
  }

  const citationById = new Map(
    input.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  const evidenceByFeedItemId = new Map(
    (input.selectedEvidence ?? []).map(
      (item) => [item.feedItemId, item] as const,
    ),
  );
  const clusterById = new Map(
    input.storyClusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const evidenceByClusterId = evidenceClusterMap(
    input.storyClusters,
    evidenceByFeedItemId,
  );
  const readerTopStories = uniqueReaderTopStories(
    input.topStories,
    citationById,
    evidenceByFeedItemId,
    clusterById,
  ).slice(0, maxReaderTopReads);
  const readerInput = {
    ...input,
    topStories: readerTopStories,
  };
  const topReads = readerTopStories.map((story) =>
    storyToReaderItem(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    ),
  );
  const sourceMix = buildSourceMix(input);
  const qualityState = buildQualityState(input.qualityFlags, sourceMix);

  return {
    headline: nonEmpty(input.headline, 'Workspace summary'),
    oneLineTakeaway:
      firstSentence(input.executiveSummary) ??
      topReads[0]?.reason ??
      'Review the latest monitored signals.',
    bullets: buildBriefingBullets(readerInput, topReads),
    qualityState,
    topicSections: buildTopicSections(readerInput, topReads),
    sourceMix,
    topReads,
    trendDelta: buildTrendDelta(readerInput, topReads, sourceMix),
    openQuestions: buildOpenQuestions(input.qualityFlags, sourceMix),
    risks: input.risksAndUnknowns
      .map((risk) => risk.description)
      .filter((risk) => risk.trim().length > 0),
    nextActions: buildNextActions(topReads, input, qualityState),
  };
};

const buildNoSignalReaderBrief = (
  input: BriefingReaderBriefFactoryInput,
): BriefingReaderBrief => {
  const reason =
    input.noSignalReason ??
    'No eligible evidence was selected for this summary window.';

  return {
    headline: nonEmpty(input.headline, 'No reliable workspace signal yet'),
    oneLineTakeaway: reason,
    bullets: [reason],
    qualityState: {
      status: 'no_signal',
      flags: uniqueNonEmpty([
        ...input.qualityFlags,
        'no_signal',
      ]) as readonly BriefingQualityFlag[],
      warnings: [
        'No cited source evidence passed the summary selection policy.',
      ],
      isSingleSource: false,
    },
    topicSections: [],
    sourceMix: [],
    topReads: [],
    trendDelta: {
      newSignals: [],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: ['Collect more source evidence before making claims.'],
    risks: input.risksAndUnknowns.map((risk) => risk.description),
    nextActions: [
      {
        kind: 'ignore_low_confidence',
        label: 'Wait for more evidence',
        reason:
          'The current summary window does not contain enough cited material.',
        citationIds: [],
      },
    ],
  };
};

const storyToReaderItem = (
  story: BriefingTopStory,
  citationById: ReadonlyMap<string, BriefingCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, BriefingEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  evidenceByClusterId: ReadonlyMap<string, readonly BriefingEvidenceItem[]>,
): BriefingReaderItem => {
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter((citation): citation is BriefingCitation => citation !== undefined);
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is BriefingEvidenceItem => item !== undefined);
  const citation = citations[0];
  const cluster = clusterById.get(story.storyClusterId);
  const clusterEvidence =
    cluster === undefined
      ? citedEvidence
      : (evidenceByClusterId.get(cluster.id) ?? citedEvidence);
  const evidence = citedEvidence[0] ?? clusterEvidence[0];
  const providerKey =
    citation?.providerKey ??
    evidence?.providerKey ??
    story.providerKeys[0] ??
    cluster?.providerKeys[0] ??
    'unknown';
  const matchedTopicIds = uniqueNonEmpty([
    ...story.topicIds,
    ...(cluster?.topicIds ?? []),
    ...citedEvidence.map((item) => item.topicId),
  ]);
  const whyImportant = compactUnique([
    ...(cluster?.whyImportant ?? []),
    ...clusterEvidence.flatMap((item) => item.whyImportant),
    story.summary,
  ]);
  const signalScore = normalizeSignalScore(
    cluster?.score ?? evidence?.score ?? 0,
  );
  const confirmedProviders = confirmedProviderKeys({
    cluster,
    evidence: clusterEvidence,
    providerKey,
  });

  return {
    title: story.title,
    providerKey,
    reason: whyImportant[0] ?? story.summary,
    matchedTopicIds:
      matchedTopicIds.length > 0 ? matchedTopicIds : ['unknown-topic'],
    matchedRules: buildMatchedRules(
      citedEvidence,
      matchedTopicIds,
      providerKey,
    ),
    signalScore,
    confidence: readerItemConfidence({
      cluster,
      evidenceCount: Math.max(
        clusterEvidence.length,
        cluster === undefined ? 0 : 1 + cluster.duplicateFeedItemIds.length,
      ),
      confirmedProviderCount: confirmedProviders.length,
      signalScore,
    }),
    confirmedProviderKeys: confirmedProviders,
    providerMetrics: formatStoryProviderMetrics({
      cluster,
      evidence: clusterEvidence,
      representativeMetrics: evidence?.providerMetrics,
    }),
    whyImportant:
      whyImportant.length > 0 ? whyImportant.slice(0, 4) : [story.summary],
    whyNow: buildWhyNow(cluster, story.providerKeys, clusterEvidence),
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
    citationIds: story.citationIds,
  };
};

const evidenceClusterMap = (
  clusters: readonly StoryCluster[],
  evidenceByFeedItemId: ReadonlyMap<string, BriefingEvidenceItem>,
): ReadonlyMap<string, readonly BriefingEvidenceItem[]> => {
  const result = new Map<string, readonly BriefingEvidenceItem[]>();

  for (const cluster of clusters) {
    const evidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]
      .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
      .filter((item): item is BriefingEvidenceItem => item !== undefined);

    result.set(cluster.id, evidence);
  }

  return result;
};

const buildBriefingBullets = (
  input: BriefingReaderBriefFactoryInput,
  topReads: readonly BriefingReaderItem[],
): readonly string[] => {
  const followUpCount = Math.max(topReads.length - 1, 0);
  const bullets = [
    topReads[0] === undefined
      ? undefined
      : `Best first read: ${topReads[0].title} - ${topReads[0].reason}`,
    followUpCount === 0
      ? undefined
      : `${followUpCount} follow-up link${plural(followUpCount)} available in Top reads.`,
    ...input.repeatedSignals
      .slice(0, 2)
      .map((signal) => `Repeated signal: ${signal.title}`),
  ];
  const compacted = compactUnique(bullets);

  return compacted.length > 0
    ? compacted.slice(0, 5)
    : [input.executiveSummary];
};

const buildTopicSections = (
  input: BriefingReaderBriefFactoryInput,
  topReads: readonly BriefingReaderItem[],
): readonly BriefingReaderTopicSection[] => {
  if (input.topicHighlights.length > 0) {
    return input.topicHighlights.slice(0, 6).map((highlight) => ({
      topicId: highlight.topicId,
      title: highlight.title,
      insight: highlight.summary,
      items: topReads
        .filter((item) =>
          hasAnyCitation(item.citationIds, highlight.citationIds),
        )
        .slice(0, 3),
      citationIds: highlight.citationIds,
    }));
  }

  const sectionsByTopic = new Map<string, BriefingReaderTopicSection>();
  for (const story of input.topStories) {
    const matchingItem = topReads.find((item) =>
      hasAnyCitation(item.citationIds, story.citationIds),
    );
    for (const topicId of story.topicIds) {
      const current = sectionsByTopic.get(topicId);
      const item = matchingItem === undefined ? [] : [matchingItem];
      sectionsByTopic.set(topicId, {
        topicId,
        title: topicTitle(topicId),
        insight: current?.insight ?? story.summary,
        items: uniqueItems([...(current?.items ?? []), ...item]).slice(0, 3),
        citationIds: uniqueNonEmpty([
          ...(current?.citationIds ?? []),
          ...story.citationIds,
        ]),
      });
    }
  }

  return [...sectionsByTopic.values()].slice(0, 6);
};

const buildTrendDelta = (
  input: BriefingReaderBriefFactoryInput,
  topReads: readonly BriefingReaderItem[],
  sourceMix: readonly BriefingSourceMixEntry[],
) => {
  const topicSignals = uniqueNonEmpty([
    ...input.topicHighlights.map((highlight) => highlight.title),
    ...input.topStories.flatMap((story) => story.topicIds.map(topicTitle)),
  ]);
  const totalReads = topReads.length;
  const newSignal =
    totalReads === 0
      ? undefined
      : sourceMix.length === 1
        ? `${totalReads} ${providerLabel(sourceMix[0]?.providerKey ?? 'unknown')} item${plural(totalReads)} selected`
        : `${totalReads} cross-source item${plural(totalReads)} selected`;

  return {
    newSignals: compactUnique([newSignal]),
    growingSignals: topicSignals.slice(0, 3),
    repeatedSignals: input.repeatedSignals
      .slice(0, 3)
      .map((signal) => signal.title),
    fadingSignals: [],
  };
};

const buildOpenQuestions = (
  qualityFlags: readonly BriefingQualityFlag[],
  sourceMix: readonly BriefingSourceMixEntry[],
): readonly string[] => {
  const questions: string[] = [];
  if (qualityFlags.includes('limited_sources')) {
    questions.push(
      'Is this signal confirmed outside the currently monitored sources?',
    );
  }
  if (
    sourceMix.length === 1 ||
    sourceMix.every((source) => source.singleSourceOnly)
  ) {
    questions.push(
      `Is this signal confirmed outside ${providerLabel(sourceMix[0]?.providerKey ?? 'the current source')}?`,
    );
  }
  if (qualityFlags.includes('conflicting_evidence')) {
    questions.push(
      'Which source is the most reliable when evidence conflicts?',
    );
  }
  if (qualityFlags.includes('context_unavailable')) {
    questions.push(
      'Did missing context change the interpretation of this briefing?',
    );
  }

  return questions;
};

const buildNextActions = (
  topReads: readonly BriefingReaderItem[],
  input: BriefingReaderBriefFactoryInput,
  qualityState: BriefingReaderQualityState,
): readonly BriefingNextAction[] => {
  const actions: BriefingNextAction[] = topReads.slice(0, 3).map((item) => ({
    kind: isRepositoryProvider(item.providerKey)
      ? 'watch_repository'
      : 'read_source',
    label: isRepositoryProvider(item.providerKey)
      ? `Watch ${item.title}`
      : `Read ${item.title}`,
    reason: item.reason,
    citationIds: item.citationIds,
    canonicalUrl: item.canonicalUrl,
  }));
  const firstTopRead = topReads[0];
  const firstTopicId =
    input.topicHighlights[0]?.topicId ?? firstTopRead?.matchedTopicIds[0];

  if (
    qualityState.isSingleSource ||
    qualityState.status === 'limited_sources' ||
    qualityState.status === 'low_confidence'
  ) {
    actions.push({
      kind: 'request_deeper_scan',
      label: 'Request deeper scan',
      reason:
        'The summary has limited confirmation and needs more provider coverage before strong conclusions.',
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopicId !== undefined) {
    actions.push({
      kind: 'add_topic_rule',
      label: `Tune ${topicTitle(firstTopicId)}`,
      reason:
        'Add or adjust topic rules if this signal should be tracked more precisely.',
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopRead !== undefined) {
    actions.push(
      {
        kind: 'mark_relevant',
        label: 'Mark relevant',
        reason:
          'Use feedback to keep future summaries aligned with this signal.',
        citationIds: firstTopRead.citationIds,
        canonicalUrl: firstTopRead.canonicalUrl,
      },
      {
        kind: 'mark_not_relevant',
        label: 'Not relevant',
        reason: 'Use feedback to reduce similar signals in future summaries.',
        citationIds: firstTopRead.citationIds,
        canonicalUrl: firstTopRead.canonicalUrl,
      },
    );
  }

  if (
    qualityState.status === 'no_signal' ||
    qualityState.status === 'low_confidence'
  ) {
    actions.push({
      kind: 'ignore_low_confidence',
      label: 'Ignore low-confidence signal',
      reason: 'Skip acting until more cited evidence appears.',
      citationIds: [],
    });
  }

  return uniqueActions(actions).slice(0, 7);
};

const isRepositoryProvider = (providerKey: string): boolean =>
  providerKey === 'github-repo-radar' || providerKey === 'github-trending-page';
