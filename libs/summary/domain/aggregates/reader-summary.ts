import type { ReaderSummaryCitation } from "../entities/citation";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
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
import {
  emptyReaderSummaryTopicMap,
  type ReaderSummaryTopicMap,
} from "../entities/reader-summary-topic-map";
import { buildReaderActions } from "../policies/reader-action-policy";
import {
  buildReaderSummaryQualityState,
  buildSourceMix,
} from "../policies/source-mix-quality-policy";
import { buildInterestSections } from "../policies/reader-interest-section-policy";
import { selectUniqueTopReadCandidates } from "../policies/top-read-selection-policy";
import { buildReaderSummaryReliabilityReport } from "../policies/reader-summary-reliability-calibration-policy";
import type {
  SummaryEvidenceSelection,
  StoryCluster,
  SummaryEvidenceItem,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
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
  groundedReaderHeadline,
} from "../services/reader-summary-support";
import {
  evidenceClusterMap,
  storyToTopRead,
} from "../services/reader-summary-top-read-builder";
import { buildReaderSummaryMainTopics } from "../services/reader-summary-main-topics";
import { buildReaderSummarySelectedPosts } from "../services/reader-summary-selected-posts";
import {
  buildOpenQuestions,
  providerNameForKey,
} from "./reader-summary-open-questions";
import { buildReaderSummaryClaimBoard } from "../services/reader-summary-claim-board";

export type ReaderSummaryFactoryInput = {
  readonly headline: string;
  readonly executiveSummary: string;
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyClusters: readonly StoryCluster[];
  readonly sourceWindow?: SummarySourceWindow;
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly topicMap?: ReaderSummaryTopicMap;
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
      maxReaderTopReads,
    );

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
    const selectedPosts = buildReaderSummarySelectedPosts({
      topReads,
      selectedEvidence: input.selectedEvidence,
      citationById,
    });

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
      mainTopics: buildReaderSummaryMainTopics({
        topReads,
        topStories: readerTopStories,
        interestHighlights: input.interestHighlights,
        repeatedSignals: input.repeatedSignals,
        selectedEvidence: input.selectedEvidence,
      }),
      topicMap: input.topicMap ?? emptyReaderSummaryTopicMap(),
      qualityState,
      interestSections: buildInterestSections(readerInput),
      sourceMix,
      topReads,
      selectedPosts,
      claimBoard: buildReaderSummaryClaimBoard({
        topReads,
        risksAndUnknowns: input.risksAndUnknowns,
        citationMap: input.citationMap,
      }),
      reliabilityReport: buildReaderSummaryReliabilityReport(
        reliabilitySelectionFromInput(input),
      ),
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
      mainTopics: [...(this.snapshot.mainTopics ?? [])],
      topicMap: this.snapshot.topicMap ?? emptyReaderSummaryTopicMap(),
      interestSections: [...this.snapshot.interestSections],
      sourceMix: [...this.snapshot.sourceMix],
      topReads: [...this.snapshot.topReads],
      selectedPosts: [...(this.snapshot.selectedPosts ?? [])],
      claimBoard: [...this.snapshot.claimBoard],
      reliabilityReport: {
        ...this.snapshot.reliabilityReport,
        risks: [...this.snapshot.reliabilityReport.risks],
      },
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
    mainTopics: [],
    topicMap: emptyReaderSummaryTopicMap(),
    interestSections: [],
    sourceMix: [],
    topReads: [],
    selectedPosts: [],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
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

const reliabilitySelectionFromInput = (
  input: ReaderSummaryFactoryInput,
): SummaryEvidenceSelection | undefined => {
  if (input.selectedEvidence === undefined) {
    return undefined;
  }

  return {
    rankingPolicyVersion:
      input.storyClusters[0]?.rankingPolicyVersion ?? "unknown",
    sourceWindow:
      input.sourceWindow ??
      fallbackSourceWindow(input.selectedEvidence, input.storyClusters),
    clusters: input.storyClusters,
    selectedEvidence: input.selectedEvidence,
  };
};

const fallbackSourceWindow = (
  selectedEvidence: readonly SummaryEvidenceItem[],
  storyClusters: readonly StoryCluster[],
): SummarySourceWindow => ({
  windowId: "reader-summary-input",
  startedAt:
    selectedEvidence
      .map((item) => item.observedAt)
      .sort((left, right) => left.getTime() - right.getTime())
      .at(0) ?? new Date(0),
  endedAt:
    selectedEvidence
      .map((item) => item.observedAt)
      .sort((left, right) => right.getTime() - left.getTime())
      .at(0) ?? new Date(0),
  selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
  storyClusterIds: storyClusters.map((cluster) => cluster.id),
});

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
    ...input.topStories.flatMap((story) =>
      story.interestIds.map(interestTitle),
    ),
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
