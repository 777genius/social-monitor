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
import type { BriefingEvidenceItem, StoryCluster } from '../value-objects/briefing-evidence-item';
import {
  buildMatchedRules,
  buildWhyNow,
  compactUnique,
  firstSentence,
  formatProviderMetrics,
  hasAnyCitation,
  nonEmpty,
  normalizeSignalScore,
  plural,
  providerLabel,
  topicTitle,
  uniqueActions,
  uniqueItems,
  uniqueNonEmpty,
} from './briefing-reader-brief-support';

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

export const buildBriefingReaderBrief = (
  input: BriefingReaderBriefFactoryInput,
): BriefingReaderBrief => {
  if (input.topStories.length === 0) {
    return buildNoSignalReaderBrief(input);
  }

  const citationById = new Map(input.citationMap.map((citation) => [citation.citationId, citation] as const));
  const evidenceByFeedItemId = new Map(
    (input.selectedEvidence ?? []).map((item) => [item.feedItemId, item] as const),
  );
  const clusterById = new Map(input.storyClusters.map((cluster) => [cluster.id, cluster] as const));
  const topReads = input.topStories.slice(0, 6).map((story) =>
    storyToReaderItem(story, citationById, evidenceByFeedItemId, clusterById),
  );
  const sourceMix = buildSourceMix(input);
  const qualityState = buildQualityState(input.qualityFlags, sourceMix);

  return {
    headline: nonEmpty(input.headline, 'Workspace briefing'),
    oneLineTakeaway: firstSentence(input.executiveSummary) ?? topReads[0]?.reason ?? 'Review the latest monitored signals.',
    bullets: buildBriefingBullets(input, topReads),
    qualityState,
    topicSections: buildTopicSections(input, topReads),
    sourceMix,
    topReads,
    trendDelta: buildTrendDelta(input, topReads, sourceMix),
    openQuestions: buildOpenQuestions(input.qualityFlags, sourceMix),
    risks: input.risksAndUnknowns.map((risk) => risk.description).filter((risk) => risk.trim().length > 0),
    nextActions: buildNextActions(topReads, input, qualityState),
  };
};

const buildNoSignalReaderBrief = (input: BriefingReaderBriefFactoryInput): BriefingReaderBrief => {
  const reason = input.noSignalReason ?? 'No eligible evidence was selected for this briefing window.';

  return {
    headline: nonEmpty(input.headline, 'No reliable workspace signal yet'),
    oneLineTakeaway: reason,
    bullets: [reason],
    qualityState: {
      status: 'no_signal',
      flags: uniqueNonEmpty([...input.qualityFlags, 'no_signal']) as readonly BriefingQualityFlag[],
      warnings: ['No cited source evidence passed the briefing selection policy.'],
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
        reason: 'The current briefing window does not contain enough cited material.',
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
): BriefingReaderItem => {
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter((citation): citation is BriefingCitation => citation !== undefined);
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is BriefingEvidenceItem => item !== undefined);
  const citation = citations[0];
  const evidence = citedEvidence[0];
  const cluster = clusterById.get(story.storyClusterId);
  const providerKey = citation?.providerKey ?? evidence?.providerKey ?? story.providerKeys[0] ?? cluster?.providerKeys[0] ?? 'unknown';
  const matchedTopicIds = uniqueNonEmpty([
    ...story.topicIds,
    ...(cluster?.topicIds ?? []),
    ...citedEvidence.map((item) => item.topicId),
  ]);
  const whyImportant = compactUnique([
    ...citedEvidence.flatMap((item) => item.whyImportant),
    ...(cluster?.whyImportant ?? []),
    story.summary,
  ]);

  return {
    title: story.title,
    providerKey,
    reason: whyImportant[0] ?? story.summary,
    matchedTopicIds: matchedTopicIds.length > 0 ? matchedTopicIds : ['unknown-topic'],
    matchedRules: buildMatchedRules(citedEvidence, matchedTopicIds, providerKey),
    signalScore: normalizeSignalScore(cluster?.score ?? evidence?.score ?? 0),
    providerMetrics: formatProviderMetrics(evidence?.providerMetrics),
    whyImportant: whyImportant.length > 0 ? whyImportant.slice(0, 4) : [story.summary],
    whyNow: buildWhyNow(cluster, story.providerKeys, citedEvidence),
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
    citationIds: story.citationIds,
  };
};

const buildBriefingBullets = (
  input: BriefingReaderBriefFactoryInput,
  topReads: readonly BriefingReaderItem[],
): readonly string[] => {
  const followUpCount = Math.max(topReads.length - 1, 0);
  const bullets = [
    topReads[0] === undefined ? undefined : `Best first read: ${topReads[0].title} - ${topReads[0].reason}`,
    followUpCount === 0 ? undefined : `${followUpCount} follow-up link${plural(followUpCount)} available in Top links.`,
    ...input.repeatedSignals.slice(0, 2).map((signal) => `Repeated signal: ${signal.title}`),
  ];
  const compacted = compactUnique(bullets);

  return compacted.length > 0 ? compacted.slice(0, 5) : [input.executiveSummary];
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
      items: topReads.filter((item) => hasAnyCitation(item.citationIds, highlight.citationIds)).slice(0, 3),
      citationIds: highlight.citationIds,
    }));
  }

  const sectionsByTopic = new Map<string, BriefingReaderTopicSection>();
  for (const story of input.topStories) {
    const matchingItem = topReads.find((item) => hasAnyCitation(item.citationIds, story.citationIds));
    for (const topicId of story.topicIds) {
      const current = sectionsByTopic.get(topicId);
      const item = matchingItem === undefined ? [] : [matchingItem];
      sectionsByTopic.set(topicId, {
        topicId,
        title: topicTitle(topicId),
        insight: current?.insight ?? story.summary,
        items: uniqueItems([...(current?.items ?? []), ...item]).slice(0, 3),
        citationIds: uniqueNonEmpty([...(current?.citationIds ?? []), ...story.citationIds]),
      });
    }
  }

  return [...sectionsByTopic.values()].slice(0, 6);
};

const buildSourceMix = (input: BriefingReaderBriefFactoryInput): readonly BriefingSourceMixEntry[] => {
  const counts = new Map<string, {
    itemIds: Set<string>;
    citationIds: Set<string>;
    storyClusterIds: Set<string>;
    crossSourceClusterIds: Set<string>;
    topicIds: Set<string>;
  }>();
  for (const item of input.selectedEvidence ?? []) {
    const current = sourceMixCount(counts, item.providerKey);
    current.itemIds.add(item.feedItemId);
    current.topicIds.add(item.topicId);
  }
  for (const citation of input.citationMap) {
    const current = sourceMixCount(counts, citation.providerKey);
    current.itemIds.add(citation.feedItemId);
    current.citationIds.add(citation.citationId);
  }
  for (const cluster of input.storyClusters) {
    const isCrossSource = cluster.providerKeys.length > 1;
    for (const providerKey of cluster.providerKeys) {
      const current = sourceMixCount(counts, providerKey);
      current.storyClusterIds.add(cluster.id);
      if (isCrossSource) {
        current.crossSourceClusterIds.add(cluster.id);
      }
      for (const topicId of cluster.topicIds) {
        current.topicIds.add(topicId);
      }
    }
  }

  return [...counts.entries()]
    .map(([providerKey, value]) => ({
      providerKey,
      itemCount: value.itemIds.size,
      citationCount: value.citationIds.size,
      storyClusterCount: value.storyClusterIds.size,
      crossSourceClusterCount: value.crossSourceClusterIds.size,
      singleSourceOnly: value.crossSourceClusterIds.size === 0,
      topicIds: [...value.topicIds].sort(),
    }))
    .sort((left, right) =>
      right.itemCount - left.itemCount ||
      right.storyClusterCount - left.storyClusterCount ||
      left.providerKey.localeCompare(right.providerKey));
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
    repeatedSignals: input.repeatedSignals.slice(0, 3).map((signal) => signal.title),
    fadingSignals: [],
  };
};

const buildOpenQuestions = (
  qualityFlags: readonly BriefingQualityFlag[],
  sourceMix: readonly BriefingSourceMixEntry[],
): readonly string[] => {
  const questions: string[] = [];
  if (qualityFlags.includes('limited_sources')) {
    questions.push('Is this signal confirmed outside the currently monitored sources?');
  }
  if (sourceMix.length === 1 || sourceMix.every((source) => source.singleSourceOnly)) {
    questions.push(`Is this signal confirmed outside ${providerLabel(sourceMix[0]?.providerKey ?? 'the current source')}?`);
  }
  if (qualityFlags.includes('conflicting_evidence')) {
    questions.push('Which source is the most reliable when evidence conflicts?');
  }
  if (qualityFlags.includes('context_unavailable')) {
    questions.push('Did missing context change the interpretation of this briefing?');
  }

  return questions;
};

const buildNextActions = (
  topReads: readonly BriefingReaderItem[],
  input: BriefingReaderBriefFactoryInput,
  qualityState: BriefingReaderQualityState,
): readonly BriefingNextAction[] => {
  const actions: BriefingNextAction[] = topReads.slice(0, 3).map((item) => ({
    kind: item.providerKey === 'github-repo-radar' ? 'watch_repository' : 'read_source',
    label: item.providerKey === 'github-repo-radar' ? `Watch ${item.title}` : `Read ${item.title}`,
    reason: item.reason,
    citationIds: item.citationIds,
    canonicalUrl: item.canonicalUrl,
  }));
  const firstTopRead = topReads[0];
  const firstTopicId = input.topicHighlights[0]?.topicId ?? firstTopRead?.matchedTopicIds[0];

  if (qualityState.isSingleSource || qualityState.status === 'limited_sources' || qualityState.status === 'low_confidence') {
    actions.push({
      kind: 'request_deeper_scan',
      label: 'Request deeper scan',
      reason: 'The briefing has limited confirmation and needs more provider coverage before strong conclusions.',
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopicId !== undefined) {
    actions.push({
      kind: 'add_topic_rule',
      label: `Tune ${topicTitle(firstTopicId)}`,
      reason: 'Add or adjust topic rules if this signal should be tracked more precisely.',
      citationIds: firstTopRead?.citationIds ?? [],
      canonicalUrl: firstTopRead?.canonicalUrl,
    });
  }

  if (firstTopRead !== undefined) {
    actions.push({
      kind: 'mark_relevant',
      label: 'Mark relevant',
      reason: 'Use feedback to keep future briefings aligned with this signal.',
      citationIds: firstTopRead.citationIds,
      canonicalUrl: firstTopRead.canonicalUrl,
    }, {
      kind: 'mark_not_relevant',
      label: 'Not relevant',
      reason: 'Use feedback to reduce similar signals in future briefings.',
      citationIds: firstTopRead.citationIds,
      canonicalUrl: firstTopRead.canonicalUrl,
    });
  }

  if (qualityState.status === 'no_signal' || qualityState.status === 'low_confidence') {
    actions.push({
      kind: 'ignore_low_confidence',
      label: 'Ignore low-confidence signal',
      reason: 'Skip acting until more cited evidence appears.',
      citationIds: [],
    });
  }

  return uniqueActions(actions).slice(0, 7);
};

const sourceMixCount = (
  counts: Map<string, {
    itemIds: Set<string>;
    citationIds: Set<string>;
    storyClusterIds: Set<string>;
    crossSourceClusterIds: Set<string>;
    topicIds: Set<string>;
  }>,
  providerKey: string,
) => {
  const current = counts.get(providerKey) ?? {
    itemIds: new Set<string>(),
    citationIds: new Set<string>(),
    storyClusterIds: new Set<string>(),
    crossSourceClusterIds: new Set<string>(),
    topicIds: new Set<string>(),
  };
  counts.set(providerKey, current);

  return current;
};

const buildQualityState = (
  qualityFlags: readonly BriefingQualityFlag[],
  sourceMix: readonly BriefingSourceMixEntry[],
): BriefingReaderQualityState => {
  const flags = uniqueNonEmpty(qualityFlags) as readonly BriefingQualityFlag[];
  const isSingleSource = sourceMix.length === 1 || (sourceMix.length > 0 && sourceMix.every((source) => source.singleSourceOnly));
  const warnings = compactUnique([
    flags.includes('partial_evidence') ? 'Only partial evidence was available for this briefing.' : undefined,
    flags.includes('context_unavailable') ? 'Additional context was unavailable during generation.' : undefined,
    flags.includes('provider_failed') ? 'At least one source provider failed during generation.' : undefined,
    flags.includes('limited_sources') || isSingleSource ? 'Source coverage is limited or single-source.' : undefined,
    flags.includes('low_confidence') ? 'The model marked this briefing as low confidence.' : undefined,
    flags.includes('conflicting_evidence') ? 'Some cited evidence conflicts across sources.' : undefined,
  ]);

  return {
    status: qualityStatus(flags, isSingleSource),
    flags,
    warnings,
    isSingleSource,
  };
};

const qualityStatus = (
  flags: readonly BriefingQualityFlag[],
  isSingleSource: boolean,
): BriefingReaderQualityState['status'] => {
  if (flags.includes('no_signal')) {
    return 'no_signal';
  }
  if (flags.includes('provider_failed')) {
    return 'failed_provider';
  }
  if (flags.includes('partial_evidence') || flags.includes('context_unavailable')) {
    return 'partial';
  }
  if (flags.includes('low_confidence')) {
    return 'low_confidence';
  }
  if (flags.includes('limited_sources') || isSingleSource) {
    return 'limited_sources';
  }

  return 'ready';
};
