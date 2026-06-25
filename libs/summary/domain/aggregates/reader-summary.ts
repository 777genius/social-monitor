import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderAction } from "../entities/reader-action";
import type { ReaderSummarySnapshot } from "../entities/reader-summary-snapshot";
import type { SourceMixEntry } from "../entities/source-mix-entry";
import type {
  ReaderTopicSection,
  ReaderTrendDelta,
  ReaderSummaryRisk,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
  TopicHighlight,
} from "../entities/top-read";
import { buildReaderActions } from "../policies/reader-action-policy";
import {
  buildReaderSummaryQualityState,
  buildSourceMix,
} from "../policies/source-mix-quality-policy";
import { selectUniqueTopReadCandidates } from "../policies/top-read-selection-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import type {
  ReaderSummaryQualityFlag,
  ReaderSummaryQualityState,
} from "../value-objects/summary-quality";
import {
  compactUnique,
  firstSentence,
  nonEmpty,
  plural,
  topicTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";
import {
  buildMatchedRules,
  buildWhyNow,
  confirmedProviderKeys,
  hasAnyCitation,
  readerItemConfidence,
  storyProviderMetricLabels,
  uniqueItems,
} from "../services/reader-summary-support";

export type ReaderSummaryFactoryInput = {
  readonly headline: string;
  readonly executiveSummary: string;
  readonly topStories: readonly TopReadCandidate[];
  readonly topicHighlights: readonly TopicHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyClusters: readonly StoryCluster[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly noSignalReason?: string;
};

const maxReaderTopReads = 10;

export class ReaderSummary {
  private constructor(private readonly snapshot: ReaderSummarySnapshot) {}

  static create(snapshot: ReaderSummarySnapshot): ReaderSummary {
    assertReaderSummaryValid(snapshot);

    return new ReaderSummary(snapshot);
  }

  static fromEvidence(input: ReaderSummaryFactoryInput): ReaderSummary {
    if (input.topStories.length === 0) {
      return ReaderSummary.create(buildNoSignalReaderSummary(input));
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
    const readerTopStories = selectUniqueTopReadCandidates(
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
      storyToTopRead(
        story,
        citationById,
        evidenceByFeedItemId,
        clusterById,
        evidenceByClusterId,
      ),
    );
    const sourceMix = buildSourceMix(input);
    const qualityState = buildReaderSummaryQualityState(
      input.qualityFlags,
      sourceMix,
    );

    return ReaderSummary.create({
      headline: nonEmpty(input.headline, "Workspace summary"),
      oneLineTakeaway:
        firstSentence(input.executiveSummary) ??
        topReads[0]?.reason ??
        "Review the latest monitored signals.",
      bullets: buildReaderSummaryBullets(readerInput, topReads),
      qualityState,
      topicSections: buildTopicSections(readerInput, topReads),
      sourceMix,
      topReads,
      trendDelta: buildTrendDelta(readerInput, topReads, sourceMix),
      openQuestions: buildOpenQuestions(
        input.qualityFlags,
        sourceMix,
        topReads,
      ),
      risks: input.risksAndUnknowns
        .map((risk) => risk.description)
        .filter((risk) => risk.trim().length > 0),
      nextActions: buildReaderActions({
        topReads,
        topicHighlights: input.topicHighlights,
        qualityState,
      }),
    });
  }

  toSnapshot(): ReaderSummarySnapshot {
    return {
      ...this.snapshot,
      bullets: [...this.snapshot.bullets],
      topicSections: [...this.snapshot.topicSections],
      sourceMix: [...this.snapshot.sourceMix],
      topReads: [...this.snapshot.topReads],
      openQuestions: [...this.snapshot.openQuestions],
      risks: [...this.snapshot.risks],
      nextActions: [...this.snapshot.nextActions],
    };
  }
}

export const buildReaderSummary = (
  input: ReaderSummaryFactoryInput,
): ReaderSummarySnapshot => ReaderSummary.fromEvidence(input).toSnapshot();

const buildNoSignalReaderSummary = (
  input: ReaderSummaryFactoryInput,
): ReaderSummarySnapshot => {
  const reason =
    input.noSignalReason ??
    "No eligible evidence was selected for this summary window.";

  return {
    headline: nonEmpty(input.headline, "No reliable workspace signal yet"),
    oneLineTakeaway: reason,
    bullets: [reason],
    qualityState: {
      status: "no_signal",
      flags: uniqueNonEmpty([
        ...input.qualityFlags,
        "no_signal",
      ]) as readonly ReaderSummaryQualityFlag[],
      warnings: [
        "No cited source evidence passed the summary selection policy.",
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
    openQuestions: ["Collect more source evidence before making claims."],
    risks: input.risksAndUnknowns.map((risk) => risk.description),
    nextActions: [
      {
        kind: "ignore_low_confidence",
        label: "Wait for more evidence",
        reason:
          "The current summary window does not contain enough cited material.",
        citationIds: [],
      },
    ],
  };
};

const storyToTopRead = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  evidenceByClusterId: ReadonlyMap<string, readonly SummaryEvidenceItem[]>,
): TopRead => {
  const citations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
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
    "unknown";
  const providerName = evidence?.providerName ?? providerKey;
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
    providerName,
    primaryActionKind: evidence?.readerActionKind ?? "read_source",
    reason: whyImportant[0] ?? story.summary,
    matchedTopicIds:
      matchedTopicIds.length > 0 ? matchedTopicIds : ["unknown-topic"],
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
    providerMetrics: storyProviderMetricLabels({
      evidence: clusterEvidence,
      representativeMetricLabels: evidence?.providerMetricLabels,
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
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): ReadonlyMap<string, readonly SummaryEvidenceItem[]> => {
  const result = new Map<string, readonly SummaryEvidenceItem[]>();

  for (const cluster of clusters) {
    const evidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]
      .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
      .filter((item): item is SummaryEvidenceItem => item !== undefined);

    result.set(cluster.id, evidence);
  }

  return result;
};

const buildReaderSummaryBullets = (
  input: ReaderSummaryFactoryInput,
  topReads: readonly TopRead[],
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
  input: ReaderSummaryFactoryInput,
  topReads: readonly TopRead[],
): readonly ReaderTopicSection[] => {
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

  const sectionsByTopic = new Map<string, ReaderTopicSection>();
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
  input: ReaderSummaryFactoryInput,
  topReads: readonly TopRead[],
  sourceMix: readonly SourceMixEntry[],
): ReaderTrendDelta => {
  const topicSignals = uniqueNonEmpty([
    ...input.topicHighlights.map((highlight) => highlight.title),
    ...input.topStories.flatMap((story) => story.topicIds.map(topicTitle)),
  ]);
  const totalReads = topReads.length;
  const newSignal =
    totalReads === 0
      ? undefined
      : sourceMix.length === 1
        ? `${totalReads} ${providerNameForKey(sourceMix[0]?.providerKey, topReads)} item${plural(totalReads)} selected`
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
  qualityFlags: readonly ReaderSummaryQualityFlag[],
  sourceMix: readonly SourceMixEntry[],
  topReads: readonly TopRead[],
): readonly string[] => {
  const questions: string[] = [];
  if (qualityFlags.includes("limited_sources")) {
    questions.push(
      "Is this signal confirmed outside the currently monitored sources?",
    );
  }
  if (
    sourceMix.length === 1 ||
    sourceMix.every((source) => source.singleSourceOnly)
  ) {
    questions.push(
      `Is this signal confirmed outside ${providerNameForKey(sourceMix[0]?.providerKey, topReads)}?`,
    );
  }
  if (qualityFlags.includes("conflicting_evidence")) {
    questions.push(
      "Which source is the most reliable when evidence conflicts?",
    );
  }
  if (qualityFlags.includes("context_unavailable")) {
    questions.push(
      "Did missing context change the interpretation of this summary?",
    );
  }

  return questions;
};

const providerNameForKey = (
  providerKey: string | undefined,
  topReads: readonly TopRead[],
): string => {
  if (providerKey === undefined) {
    return "the current source";
  }

  return (
    topReads.find((item) => item.providerKey === providerKey)?.providerName ??
    providerKey
  );
};

const assertReaderSummaryValid = (snapshot: ReaderSummarySnapshot): void => {
  if (snapshot.headline.trim().length === 0) {
    throw new Error("Reader summary headline must be non-empty");
  }
  if (snapshot.oneLineTakeaway.trim().length === 0) {
    throw new Error("Reader summary takeaway must be non-empty");
  }
  for (const topRead of snapshot.topReads) {
    if (topRead.title.trim().length === 0) {
      throw new Error("Reader summary top read title must be non-empty");
    }
    if (topRead.signalScore < 0) {
      throw new Error("Reader summary signal score must be non-negative");
    }
    for (const metric of topRead.providerMetrics) {
      if (
        /^(story signal|base signal|cross-source support|same-source support|provider diversity|topic diversity|freshness)$/iu.test(
          metric.label,
        )
      ) {
        throw new Error(
          "Provider metrics must not duplicate normalized summary signal score",
        );
      }
    }
  }
};
