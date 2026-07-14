import type { ReaderSummaryCitation } from "../entities/citation";
import type { ReaderSummaryNarrativeSection } from "../entities/reader-summary-narrative-section";
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
import {
  selectUniqueTopReadCandidatePool,
  selectUniqueTopReadCandidates,
} from "../policies/top-read-selection-policy";
import {
  citationMapByFeedItemId,
  storyWithTopReadEligibleCitations,
} from "../policies/top-read-candidate-identity-policy";
import { selectRenderedTopReadCandidates } from "../policies/rendered-top-read-selection-policy";
import { buildReaderSummaryEditorialPriorityProfile } from "../policies/reader-summary-editorial-priority-policy";
import { enrichTopReadCandidateDescriptions } from "../policies/reader-summary-top-read-description-policy";
import { buildReaderSummaryReliabilityReport } from "../policies/reader-summary-reliability-calibration-policy";
import {
  buildSupplementalTrendNarrativeAppendix,
  isSupplementalTrendEvidence,
  selectSupplementalTrendHighlights,
  withSupplementalTrendNarrativeAppendix,
} from "../policies/reader-summary-github-trending-policy";
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
import {
  buildThematicSynthesisSupport,
  readerHeadlineForNarrativeLead,
} from "../policies/reader-summary-narrative-headline-policy";

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
  readonly topicMap?: ReaderSummaryTopicMap;
  readonly qualityFlags: readonly ReaderSummaryQualityFlag[];
  readonly noSignalReason?: string;
};

const maxReaderTopReads = 8;

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

    const primarySelectedEvidence = (input.selectedEvidence ?? []).filter(
      (item) => !isSupplementalTrendEvidence(item),
    );
    const primaryInput = {
      ...input,
      selectedEvidence: primarySelectedEvidence,
    };
    const citationById = new Map(
      input.citationMap.map(
        (citation) => [citation.citationId, citation] as const,
      ),
    );
    const evidenceByFeedItemId = new Map(
      primarySelectedEvidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map(
      input.storyClusters.map((cluster) => [cluster.id, cluster] as const),
    );
    const evidenceByClusterId = evidenceClusterMap(
      input.storyClusters,
      evidenceByFeedItemId,
    );
    const sourceMix = buildSourceMix(primaryInput);
    const narrativeLeadSection = input.narrativeSections?.find(
      (section) => section.kind === "lead",
    );
    const narrativeLeadClusterId = narrativeLeadSection?.storyClusterId;
    const thematicSynthesisSupport =
      narrativeLeadSection === undefined ||
      narrativeLeadSection.storyClusterId !== undefined
        ? undefined
        : buildThematicSynthesisSupport({
            section: narrativeLeadSection,
            citations: citationById,
            evidence: evidenceByFeedItemId,
            clusters: input.storyClusters,
          });
    const authoredNarrativeLeadStory = input.topStories.find(
      (story) => story.storyClusterId === narrativeLeadClusterId,
    );
    const narrativeLeadStory =
      authoredNarrativeLeadStory === undefined
        ? undefined
        : storyWithTopReadEligibleCitations(
            authoredNarrativeLeadStory,
            citationById,
            evidenceByFeedItemId,
            clusterById,
            citationMapByFeedItemId(citationById),
          );
    if (
      narrativeLeadClusterId !== undefined &&
      narrativeLeadStory === undefined
    ) {
      return ReaderSummary.create(
        buildNoSignalReaderSummary({
          ...input,
          headline: "No reliable workspace signal yet",
          noSignalReason:
            "The planned narrative lead did not pass the top-read evidence gate.",
        }),
      );
    }
    const curatedReaderTopStories = selectUniqueTopReadCandidates(
      input.topStories,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      maxReaderTopReads,
    );

    if (curatedReaderTopStories.length === 0) {
      return ReaderSummary.create(
        buildNoSignalReaderSummary({
          ...input,
          noSignalReason:
            "No cited source evidence passed the top-read quality gate.",
        }),
      );
    }
    const readerTopStoryPool = enrichTopReadCandidateDescriptions({
      candidates: uniqueTopReadStoryPool([
        ...(narrativeLeadStory === undefined ? [] : [narrativeLeadStory]),
        ...curatedReaderTopStories,
        ...selectUniqueTopReadCandidatePool(
          input.topStories,
          citationById,
          evidenceByFeedItemId,
          clusterById,
          maxReaderTopReads,
        ),
      ]),
      modelStories: input.topStories,
    });
    const renderedTopReadCandidates = readerTopStoryPool.map((story) => {
      const evidence = evidenceByClusterId.get(story.storyClusterId) ?? [];

      return {
        story,
        topRead: storyToTopRead(
          story,
          citationById,
          evidenceByFeedItemId,
          clusterById,
          evidenceByClusterId,
        ),
        evidence,
        editorialPriority: buildReaderSummaryEditorialPriorityProfile({
          story,
          cluster: clusterById.get(story.storyClusterId),
          evidence,
          citationCount: story.citationIds.length,
        }),
      };
    });
    const selectedReaderTopReadCandidates = selectRenderedTopReadCandidates({
      candidates: renderedTopReadCandidates,
      sourceMix,
      limit: maxReaderTopReads,
      ...(narrativeLeadStory === undefined
        ? {}
        : { pinnedStoryClusterId: narrativeLeadStory.storyClusterId }),
    });
    if (
      narrativeLeadStory !== undefined &&
      !selectedReaderTopReadCandidates.some(
        (candidate) =>
          candidate.story.storyClusterId === narrativeLeadStory.storyClusterId,
      )
    ) {
      return ReaderSummary.create(
        buildNoSignalReaderSummary({
          ...input,
          headline: "No reliable workspace signal yet",
          noSignalReason:
            "The planned narrative lead did not pass the reader-facing quality gate.",
        }),
      );
    }
    const readerTopReadCandidates = selectedReaderTopReadCandidates;
    const readerTopStories = readerTopReadCandidates.map(
      (candidate) => candidate.story,
    );
    const topReads = readerTopReadCandidates.map(
      (candidate) => candidate.topRead,
    );
    const readerInput = {
      ...primaryInput,
      topStories: readerTopStories,
    };
    const qualityState = buildReaderSummaryQualityState(
      input.qualityFlags,
      sourceMix,
    );
    const selectedPosts = buildReaderSummarySelectedPosts({
      topReads,
      selectedEvidence: input.selectedEvidence,
      citationById,
    });
    const githubTrendingAppendix = buildSupplementalTrendNarrativeAppendix({
      evidence: input.selectedEvidence ?? [],
      citations: input.citationMap,
    });
    const narrativeLead = readerTopReadCandidates.find(
      (candidate) => candidate.story.storyClusterId === narrativeLeadClusterId,
    );
    const headline =
      narrativeLead === undefined
        ? input.headline
        : readerHeadlineForNarrativeLead(
            narrativeLead.story.title,
            narrativeLead.topRead,
          );

    return ReaderSummary.create({
      headline: groundedReaderHeadline({
        headline,
        sourceMix,
        topReads,
        thematicSynthesisSupport,
      }),
      oneLineTakeaway: buildGroundedOneLineTakeaway({
        executiveSummary: input.executiveSummary,
        topReads,
        sourceMix,
        thematicSynthesisSupport,
      }),
      bullets: buildReaderSummaryBullets(readerInput, topReads),
      narrativeSections: withSupplementalTrendNarrativeAppendix({
        narrativeSections: input.narrativeSections ?? [],
        appendix: githubTrendingAppendix,
      }),
      mainTopics: buildReaderSummaryMainTopics({
        headline,
        executiveSummary: input.executiveSummary,
        topReads,
        topStories: readerTopStories,
        interestHighlights: input.interestHighlights,
        repeatedSignals: input.repeatedSignals,
        selectedEvidence: primarySelectedEvidence,
      }),
      topicMap: input.topicMap ?? emptyReaderSummaryTopicMap(),
      qualityState,
      interestSections: buildInterestSections(readerInput),
      sourceMix,
      topReads,
      selectedPosts,
      claimBoard: buildReaderSummaryClaimBoard({
        topReads,
        narrativeSections: input.narrativeSections,
        risksAndUnknowns: input.risksAndUnknowns,
        citationMap: input.citationMap,
        selectedEvidence: primarySelectedEvidence,
      }),
      reliabilityReport: buildReaderSummaryReliabilityReport(
        reliabilitySelectionFromInput(primaryInput),
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

const uniqueTopReadStoryPool = (
  stories: readonly TopReadCandidate[],
): readonly TopReadCandidate[] => {
  const seen = new Set<string>();
  const result: TopReadCandidate[] = [];

  for (const story of stories) {
    if (seen.has(story.storyClusterId)) {
      continue;
    }
    seen.add(story.storyClusterId);
    result.push(story);
  }

  return result;
};

export const buildReaderSummary = (
  input: ReaderSummaryFactoryInput,
): ReaderSummarySnapshot => ReaderSummary.fromEvidence(input).toSnapshot();

const buildNoSignalReaderSummary = (
  input: ReaderSummaryFactoryInput,
): ReaderSummarySnapshot => {
  const reason =
    input.noSignalReason ??
    "No eligible evidence was selected for this summary window.";
  const githubTrendingHighlights = selectSupplementalTrendHighlights(
    input.selectedEvidence ?? [],
  );
  const citationById = new Map(
    input.citationMap.map(
      (citation) => [citation.citationId, citation] as const,
    ),
  );
  const githubTrendingAppendix = buildSupplementalTrendNarrativeAppendix({
    evidence: githubTrendingHighlights,
    citations: input.citationMap,
  });

  return {
    headline: nonEmpty(input.headline, "No reliable workspace signal yet"),
    oneLineTakeaway: reason,
    bullets: [reason],
    narrativeSections:
      githubTrendingAppendix === undefined ? [] : [githubTrendingAppendix],
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
    selectedPosts: buildReaderSummarySelectedPosts({
      topReads: [],
      selectedEvidence: githubTrendingHighlights,
      citationById,
    }),
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
