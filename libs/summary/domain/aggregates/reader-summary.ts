import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
import type { ReaderSummarySnapshot } from "../entities/reader-summary-snapshot";
import type {
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
import { buildReaderSummaryReliabilityReport } from "../policies/reader-summary-reliability-calibration-policy";
import {
  buildSupplementalTrendNarrativeAppendix,
  isSupplementalTrendEvidence,
  withoutSupplementalTrendNarrativeSections,
  withSupplementalTrendNarrativeAppendix,
} from "../policies/reader-summary-github-trending-policy";
import type {
  StoryCluster,
  ApprovedSameStoryRelation,
  RelatedTopicRelation,
  SummaryEvidenceSelection,
  SummaryEvidenceItem,
  SummarySourceWindow,
} from "../value-objects/summary-evidence-item";
import type { ReaderSummaryEditorialSlate } from
  "../value-objects/reader-summary-editorial-slate";
import { readerSummaryIndependentProviderFamilyCount } from "../value-objects/reader-summary-provider-identity";
import type { ReaderSummaryQualityFlag } from "../value-objects/summary-quality";
import {
  compactUnique,
  plural,
  uniqueNonEmpty,
} from "../value-objects/summary-text";
import {
  buildBestFirstReadBullet,
  buildGroundedOneLineTakeaway,
  groundedReaderHeadline,
} from "../services/reader-summary-support";
import { buildReaderSummaryMainTopics } from "../services/reader-summary-main-topics";
import { buildReaderPostPromotionProjection } from "../services/reader-post-promotion-projection";
import { fallbackReaderSummarySourceWindow } from "../services/reader-summary-fallback-source-window";
import { buildOpenQuestions } from "./reader-summary-open-questions";
import { buildReaderSummaryClaimBoard } from "../services/reader-summary-claim-board";
import { buildReaderSummaryTrendDelta } from "../services/reader-summary-trend-delta";
import { buildReaderSummarySupplementalTrendSelectedPosts } from "../services/reader-summary-supplemental-selected-posts";

export type ReaderSummaryFactoryInput = {
  readonly headline: string;
  readonly executiveSummary: string;
  readonly narrativeSections?: readonly ReaderSummaryNarrativeSection[];
  readonly topStories: readonly TopReadCandidate[];
  readonly interestHighlights: readonly InterestHighlight[];
  readonly repeatedSignals: readonly RepeatedSignal[];
  readonly risksAndUnknowns: readonly ReaderSummaryRisk[];
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly storyClusters: readonly StoryCluster[];
  readonly sourceWindow?: SummarySourceWindow;
  readonly selectedEvidence?: readonly SummaryEvidenceItem[];
  readonly relatedTopicRelations?: readonly RelatedTopicRelation[];
  readonly approvedSameStoryRelations?: readonly ApprovedSameStoryRelation[];
  readonly topicMap?: ReaderSummaryTopicMap;
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly noSignalReason?: string;
  readonly editorialSlate?: ReaderSummaryEditorialSlate;
};

export class ReaderSummary {
  private constructor(private readonly snapshot: ReaderSummarySnapshot) {}
  static create(snapshot: ReaderSummarySnapshot): ReaderSummary {
    assertReaderSummaryValid(snapshot);
    return new ReaderSummary(snapshot);
  }
  static fromEvidence(input: ReaderSummaryFactoryInput): ReaderSummary {
    const primarySelectedEvidence = (input.selectedEvidence ?? []).filter(
      (item) => !isSupplementalTrendEvidence(item),
    );
    const promotion = buildReaderPostPromotionProjection({
      evidence: primarySelectedEvidence,
      clusters: input.storyClusters,
      citations: input.citationMap,
      sourceWindow:
        input.sourceWindow ??
        fallbackReaderSummarySourceWindow(
          primarySelectedEvidence,
          input.storyClusters,
        ),
      approvedSameStoryRelations: input.approvedSameStoryRelations,
      relatedTopicRelations: input.relatedTopicRelations,
      editorialSlate: input.editorialSlate,
    });
    if (
      promotion.topReads.length === 0 &&
      promotion.additionalPosts.length === 0
    ) {
      return ReaderSummary.create(buildNoSignalReaderSummary(input));
    }
    const primaryInput = {
      ...input,
      citationMap: promotion.admittedCitations,
      storyClusters: promotion.admittedClusters,
      selectedEvidence: promotion.admittedEvidence,
    };
    const sourceMix = buildSourceMix(primaryInput);
    const readerTopStories = input.topStories.filter((story) =>
      promotion.topClusterIds.has(story.storyClusterId),
    );
    const topReads = promotion.topReads;
    const readerInput = {
      ...primaryInput,
      topStories: readerTopStories,
    };
    const qualityState = buildReaderSummaryQualityState(
      input.qualityFlags,
      sourceMix,
    );
    const selectedPosts = [
      ...promotion.additionalPosts,
      ...buildReaderSummarySupplementalTrendSelectedPosts({
        selectedEvidence: input.selectedEvidence ?? [],
        citations: input.citationMap,
      }),
    ];
    const headline = input.headline;
    const narrativeSections = input.narrativeSections ?? [];
    const primaryCitationMap = promotion.admittedCitations;
    const admittedCitationIds = new Set(
      primaryCitationMap.map((citation) => citation.citationId),
    );
    const admittedClusterIds = new Set(
      promotion.admittedClusters.map((cluster) => cluster.id),
    );
    const admittedInterestHighlights = input.interestHighlights.flatMap(
      (highlight) => {
        const citationIds = highlight.citationIds.filter((citationId) =>
          admittedCitationIds.has(citationId),
        );
        return citationIds.length === 0 ? [] : [{ ...highlight, citationIds }];
      },
    );
    const admittedRepeatedSignals = input.repeatedSignals.flatMap((signal) => {
      const citationIds = signal.citationIds.filter((citationId) =>
        admittedCitationIds.has(citationId),
      );
      return !admittedClusterIds.has(signal.storyClusterId) ||
        citationIds.length === 0
        ? []
        : [{ ...signal, citationIds }];
    });
    const admittedRisks = input.risksAndUnknowns.flatMap((risk) => {
      const citationIds = (risk.citationIds ?? []).filter((citationId) =>
        admittedCitationIds.has(citationId),
      );
      return citationIds.length === 0 ? [] : [{ ...risk, citationIds }];
    });
    const primaryNarrativeSections = withoutSupplementalTrendNarrativeSections(
      narrativeSections,
      input.citationMap,
    ).flatMap((section) => {
      const citationIds = section.citationIds.filter((citationId) =>
        admittedCitationIds.has(citationId),
      );
      return citationIds.length === 0 ? [] : [{ ...section, citationIds }];
    });
    const publishedNarrativeSections = withSupplementalTrendNarrativeAppendix({
      narrativeSections: primaryNarrativeSections,
      appendix: buildSupplementalTrendNarrativeAppendix({
        evidence: input.selectedEvidence ?? [],
        citations: input.citationMap,
      }),
    });
    return ReaderSummary.create({
      headline: groundedReaderHeadline({
        headline,
        sourceTitles: (input.selectedEvidence ?? []).filter((item) =>
          input.citationMap.some((citation) =>
            citation.feedItemId === item.feedItemId &&
            topReads.some((read) => read.citationIds.includes(citation.citationId)),
          ),
        ).map((item) => item.title),
        sourceMix,
        topReads,
        ...(narrativeSections.some(
          (section) =>
            section.kind === "lead" && section.storyClusterId === undefined,
        )
          ? {
              thematicSynthesisSupport: {
                clusterCount: promotion.admittedClusters.length,
                providerCount: readerSummaryIndependentProviderFamilyCount(
                  sourceMix.map((source) => source.providerKey),
                ),
              },
            }
          : {}),
      }),
      oneLineTakeaway: buildGroundedOneLineTakeaway({
        executiveSummary: input.executiveSummary,
        topReads,
        sourceMix,
      }),
      bullets: buildReaderSummaryBullets(
        {
          ...readerInput,
          interestHighlights: admittedInterestHighlights,
          repeatedSignals: admittedRepeatedSignals,
          risksAndUnknowns: admittedRisks,
        },
        topReads,
      ),
      narrativeSections: publishedNarrativeSections,
      mainTopics: buildReaderSummaryMainTopics({
        headline,
        executiveSummary: input.executiveSummary,
        topReads,
        topStories: readerTopStories,
        interestHighlights: admittedInterestHighlights,
        repeatedSignals: admittedRepeatedSignals,
        selectedEvidence: promotion.admittedEvidence,
      }),
      topicMap: input.topicMap ?? emptyReaderSummaryTopicMap(),
      qualityState,
      interestSections: buildInterestSections({
        ...readerInput,
        interestHighlights: admittedInterestHighlights,
      }),
      sourceMix,
      topReads,
      selectedPosts,
      claimBoard: buildReaderSummaryClaimBoard({
        topReads,
        narrativeSections: publishedNarrativeSections,
        risksAndUnknowns: admittedRisks,
        citationMap: primaryCitationMap,
        selectedEvidence: promotion.admittedEvidence,
      }),
      reliabilityReport: buildReaderSummaryReliabilityReport(
        reliabilitySelectionFromInput(primaryInput),
      ),
      trendDelta: buildReaderSummaryTrendDelta({
        ...readerInput,
        topReads,
        sourceMix,
      }),
      openQuestions: buildOpenQuestions(
        input.qualityFlags,
        sourceMix,
        topReads,
      ),
      risks: admittedRisks
        .map((risk) => risk.description)
        .filter((risk) => risk.trim().length > 0),
      nextActions: buildReaderActions({
        topReads,
        interestHighlights: admittedInterestHighlights,
        qualityState,
      }),
    });
  }

  toSnapshot(): ReaderSummarySnapshot {
    return {
      ...this.snapshot,
      bullets: [...this.snapshot.bullets],
      narrativeSections: [...(this.snapshot.narrativeSections ?? [])],
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
  const appendix = buildSupplementalTrendNarrativeAppendix({
    evidence: input.selectedEvidence ?? [],
    citations: input.citationMap,
  });
  const selectedPosts = buildReaderSummarySupplementalTrendSelectedPosts({
    selectedEvidence: input.selectedEvidence ?? [],
    citations: input.citationMap,
  });
  return {
    headline: "No reliable workspace signal yet",
    oneLineTakeaway: reason,
    bullets: [reason],
    narrativeSections: appendix === undefined ? [] : [appendix],
    qualityState: {
      status: "no_signal",
      flags: uniqueNonEmpty([
        ...input.qualityFlags,
        "no_signal",
      ]) as readonly ReaderSummaryQualityFlag[],
      warnings: [
        "No primary cited source evidence passed the summary selection policy.",
      ],
      isSingleSource: false,
    },
    mainTopics: [],
    topicMap: emptyReaderSummaryTopicMap(),
    interestSections: [],
    sourceMix: [],
    topReads: [],
    selectedPosts,
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: [],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: ["Collect more source evidence before making claims."],
    risks: [],
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
      fallbackReaderSummarySourceWindow(
        input.selectedEvidence,
        input.storyClusters,
      ),
    clusters: input.storyClusters,
    selectedEvidence: input.selectedEvidence,
  };
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
