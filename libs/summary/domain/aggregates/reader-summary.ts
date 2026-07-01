import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummarySnapshot } from "../entities/reader-summary-snapshot";
import type { SourceMixEntry } from "../entities/source-mix-entry";
import type {
  ReaderTrendDelta,
  ReaderSummaryRisk,
  RepeatedSignal,
  TopRead,
  TopReadCandidate,
  InterestHighlight,
} from "../entities/top-read";
import { buildReaderActions } from "../policies/reader-action-policy";
import {
  buildReaderSummaryQualityState,
  buildSourceMix,
} from "../policies/source-mix-quality-policy";
import { buildInterestSections } from "../policies/reader-interest-section-policy";
import { selectUniqueTopReadCandidates } from "../policies/top-read-selection-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import type { ReaderSummaryQualityFlag } from "../value-objects/summary-quality";
import {
  compactUnique,
  nonEmpty,
  plural,
  interestTitle,
  uniqueNonEmpty,
} from "../value-objects/summary-text";
import {
  buildBestFirstReadBullet,
  buildGroundedOneLineTakeaway,
  buildMatchedRules,
  buildWhyNow,
  confirmedProviderKeys,
  groundedReaderHeadline,
  readerItemConfidence,
  storyProviderMetricLabels,
} from "../services/reader-summary-support";
import {
  buildOpenQuestions,
  providerNameForKey,
} from "./reader-summary-open-questions";

export type ReaderSummaryFactoryInput = {
  readonly headline: string;
  readonly executiveSummary: string;
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyClusters: readonly StoryCluster[];
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly noSignalReason?: string;
};

const maxReaderTopReads = 10;
const maxTopReadCitationIds = 4;

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

    if (readerTopStories.length === 0) {
      return ReaderSummary.create(
        buildNoSignalReaderSummary({
          ...input,
          noSignalReason:
            "No cited source evidence passed the top-read quality gate.",
        }),
      );
    }

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
      headline: groundedReaderHeadline({
        headline: input.headline,
        sourceMix,
        topReads,
      }),
      oneLineTakeaway: buildGroundedOneLineTakeaway({
        executiveSummary: input.executiveSummary,
        topReads,
        sourceMix,
      }),
      bullets: buildReaderSummaryBullets(readerInput, topReads),
      qualityState,
      interestSections: buildInterestSections(readerInput),
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
        interestHighlights: input.interestHighlights,
        qualityState,
      }),
    });
  }

  toSnapshot(): ReaderSummarySnapshot {
    return {
      ...this.snapshot,
      bullets: [...this.snapshot.bullets],
      interestSections: [...this.snapshot.interestSections],
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
    interestSections: [],
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
  const modelCitations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const modelCitedEvidence = modelCitations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const cluster = clusterById.get(story.storyClusterId);
  const clusterEvidence =
    cluster === undefined
      ? modelCitedEvidence
      : (evidenceByClusterId.get(cluster.id) ?? modelCitedEvidence);
  const citationIdByFeedItemId = new Map(
    [...citationById.values()].map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const citationIds = compactUnique([
    ...story.citationIds,
    ...clusterEvidence.map((item) =>
      citationIdByFeedItemId.get(item.feedItemId),
    ),
  ]).slice(0, maxTopReadCitationIds);
  const citations = citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const citation = citations[0];
  const evidence = citedEvidence[0] ?? clusterEvidence[0];
  const providerKey =
    citation?.providerKey ??
    evidence?.providerKey ??
    story.providerKeys[0] ??
    cluster?.providerKeys[0] ??
    "unknown";
  const providerName = evidence?.providerName ?? providerKey;
  const matchedInterestIds = uniqueNonEmpty([
    ...story.interestIds,
    ...(cluster?.interestIds ?? []),
    ...citedEvidence.map((item) => item.interestId),
  ]);
  const whyImportant = buildTopReadUserFacingReasons({
    story,
    cluster,
    evidence: clusterEvidence,
  });
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
    matchedInterestIds:
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
    matchedRules: buildMatchedRules(
      citedEvidence,
      matchedInterestIds,
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
    whyImportant,
    whyNow: buildWhyNow(cluster, story.providerKeys, clusterEvidence),
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
    previewMedia: selectTopReadPreviewMedia(evidence, clusterEvidence),
    citationIds,
  };
};

const selectTopReadPreviewMedia = (
  representative: SummaryEvidenceItem | undefined,
  evidence: readonly SummaryEvidenceItem[],
): TopRead["previewMedia"] =>
  representative?.previewMedia ??
  evidence.find((item) => item.previewMedia !== undefined)?.previewMedia;

const buildTopReadUserFacingReasons = (params: {
  readonly story: TopReadCandidate;
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): readonly string[] => {
  const candidates = compactUnique([
    ...(params.cluster?.whyImportant ?? []),
    ...params.evidence.flatMap((item) => item.whyImportant),
    params.story.summary,
  ]).filter(isUserFacingTopReadReason);

  if (candidates.length > 0) {
    return candidates.slice(0, 4);
  }

  return [`Source-reported: ${params.story.title}`];
};

const isUserFacingTopReadReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    !lower.startsWith("story signal score") &&
    !lower.startsWith("current summary window has") &&
    lower !== "strong source engagement signal" &&
    lower !== "passes source quality and interest relevance gate" &&
    lower !== "fresh item in the current monitoring window" &&
    !/^clustered \d+ (?:similar|related) items?$/u.test(lower) &&
    !lower.includes("citation references bodypreview evidence") &&
    !lower.includes("source item source-binding") &&
    !lower.includes("bodypreview evidence from source item")
  );
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
      : buildBestFirstReadBullet(topReads[0]),
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

const buildTrendDelta = (
  input: ReaderSummaryFactoryInput,
  topReads: readonly TopRead[],
  sourceMix: readonly SourceMixEntry[],
): ReaderTrendDelta => {
  const interestSignals = uniqueNonEmpty([
    ...input.interestHighlights.map((highlight) => highlight.title),
    ...input.topStories.flatMap((story) => story.interestIds.map(interestTitle)),
  ]);
  const totalReads = topReads.length;
  const newSignal =
    totalReads === 0
      ? undefined
      : sourceMix.length === 1
        ? `${totalReads} ${providerNameForKey(sourceMix[0]?.providerKey, topReads)} item${plural(totalReads)} selected`
        : `${totalReads} ${sourceMixSignalLabel(sourceMix)} item${plural(totalReads)} selected`;

  return {
    newSignals: compactUnique([newSignal]),
    growingSignals: interestSignals.slice(0, 3),
    repeatedSignals: input.repeatedSignals
      .slice(0, 3)
      .map((signal) => signal.title),
    fadingSignals: [],
  };
};

const sourceMixSignalLabel = (sourceMix: readonly SourceMixEntry[]): string =>
  sourceMix.some((source) => source.crossSourceClusterCount > 0)
    ? "cross-source"
    : "multi-source";

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
        /^(story signal|base signal|cross-source support|same-source support|provider diversity|interest diversity|freshness)$/iu.test(
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
