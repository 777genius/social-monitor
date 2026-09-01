import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import {
  READER_SUMMARY_EDITORIAL_SLATE_VERSION,
  type ReaderSummaryEditorialScoreComponents,
  type ReaderSummaryEditorialSlate,
  type ReaderSummaryEditorialSlateEntry,
} from "../value-objects/reader-summary-editorial-slate";
import {
  publicationContentQuality,
  publicationStoryCluster,
} from "./reader-summary-publication-policy.spec-support";

export const evidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceContentQuality;
  } = {},
): SummaryEvidenceSelection => {
  const selection: SummaryEvidenceSelection = {
    rankingPolicyVersion: "story-ranking.test.v1",
    sourceWindow: {
      windowId: "window-publication",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["feed-publication-1"],
      storyClusterIds: ["story-publication-1"],
      periodStartedAt: new Date("2026-07-05T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-06T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
    },
    clusters: [
      {
        id: "story-publication-1",
        storyKey: "publication-quality",
        representativeFeedItemId: "feed-publication-1",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-05T08:00:00.000Z"),
          endedAt: new Date("2026-07-05T09:00:00.000Z"),
        },
        whyImportant: ["Relevant discussion"],
      },
    ],
    selectedEvidence: [
      {
        feedItemId: "feed-publication-1",
        sourceItemId: "source-publication-1",
        sourceBindingId: "binding-publication-1",
        interestId: "interest-ai",
        providerKey: "reddit",
        providerName: "Reddit",
        canonicalUrl: "https://reddit.example.test/post",
        title: "AI runtime quality discussion",
        bodyPreview: "A source discusses runtime quality.",
        publishedAt: new Date("2026-07-05T08:00:00.000Z"),
        observedAt: new Date("2026-07-05T08:05:00.000Z"),
        score: 1,
        whyImportant: ["Relevant discussion"],
        contentQuality:
          overrides.firstContentQuality ?? publicationContentQuality,
        promotionFacts: {
          contentKind: "original_post",
          canonicalIdentity: "url:https://reddit.example.test/post",
          safetyValid: true,
          freshnessValid: true,
          freshnessProvenance: {
            status: "observed",
            publishedAt: new Date("2026-07-05T08:00:00.000Z"),
            observedAt: new Date("2026-07-05T08:05:00.000Z"),
            ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
          },
          metricsState: "observed",
          metrics: {
            provider: "reddit",
            score: 50,
            upvoteRatio: 0.6,
          },
        },
      },
    ],
  };
  return {
    ...selection,
    editorialSlate: publicationEditorialSlate(
      selection,
      ["feed-publication-1"],
    ),
  };
};

export const dailyEvidenceSelection = (
  secondPoints = 0,
): SummaryEvidenceSelection => {
  const base = evidenceSelection();
  const first = base.selectedEvidence[0]!;
  const firstCluster = base.clusters[0]!;
  const secondCluster = publicationStoryCluster({
    id: "story-publication-2",
    representativeFeedItemId: "feed-publication-2",
    providerKeys: ["hacker-news"],
  });
  const contentQuality: SummaryEvidenceContentQuality = {
    qualityScore: 0.8,
    interestRelevanceScore: 0.8,
    engagementIntegrityScore: 0.8,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "eligible",
    flags: [],
    reason: "Strong signal",
  };
  const selectedEvidence: SummaryEvidenceSelection["selectedEvidence"] = [
    { ...first, score: 3, contentQuality },
    {
      ...first,
      feedItemId: "feed-publication-2",
      sourceItemId: "source-publication-2",
      sourceBindingId: "binding-publication-2",
      providerKey: "hacker-news",
      providerName: "Hacker News",
      canonicalUrl: "https://news.example.test/item/2",
      title: "Developers compare AI workflow costs",
      score: 2.4,
      contentQuality,
      promotionFacts: {
        contentKind: "story",
        canonicalIdentity: "url:https://news.example.test/item/2",
        safetyValid: true,
        freshnessValid: true,
        freshnessProvenance: {
          status: "observed",
          publishedAt: new Date("2026-07-05T08:00:00.000Z"),
          observedAt: new Date("2026-07-05T08:05:00.000Z"),
          ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
        },
        metricsState: "observed",
        metrics: { provider: "hacker_news", points: secondPoints },
      },
    },
  ];
  const selection: SummaryEvidenceSelection = {
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: [firstCluster.id, secondCluster.id],
    },
    clusters: [
      { ...firstCluster, score: 3 },
      { ...secondCluster, score: 2.4 },
    ],
    selectedEvidence,
  };
  const orderedCandidateIds = secondPoints < 25
    ? ["feed-publication-1"]
    : secondPoints >= 50
      ? ["feed-publication-2", "feed-publication-1"]
      : ["feed-publication-1", "feed-publication-2"];
  return {
    ...selection,
    editorialSlate: publicationEditorialSlate(
      selection,
      orderedCandidateIds,
    ),
  };
};

const publicationEditorialSlate = (
  selection: SummaryEvidenceSelection,
  orderedCandidateIds: readonly string[],
): ReaderSummaryEditorialSlate => {
  const evidenceById = new Map(selection.selectedEvidence.map((item) =>
    [item.feedItemId, item] as const));
  const clusterByCandidateId = new Map(selection.clusters.flatMap((cluster) =>
    [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
      (candidateId) => [candidateId, cluster.id] as const,
    )));
  const entries = orderedCandidateIds.map((candidateId, index) => {
    const evidence = evidenceById.get(candidateId);
    const canonicalIdentity = evidence?.promotionFacts?.canonicalIdentity;
    const storyClusterId = clusterByCandidateId.get(candidateId);
    if (evidence === undefined || canonicalIdentity === undefined ||
        storyClusterId === undefined) {
      throw new Error("Publication fixture editorial slate is incomplete");
    }
    const provider = publicationEditorialProvider(evidence.providerKey);
    const scoreComponents = publicationEditorialScoreComponents(evidence);
    const reasonCodes = [
      "reader_promotion_v2_admitted",
      "semantic_story_representative",
      "top_slot_assigned",
      ...(orderedCandidateIds.length > 1 ? ["provider_cap_enforced"] : []),
    ];
    const candidateDigestInput = JSON.stringify({
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      candidateId,
      canonicalIdentity,
      provider,
      totalScore: scoreComponents.total.toFixed(12),
    });
    const body = {
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      placement: "top" as const,
      slot: index + 1,
      candidateId,
      canonicalIdentity,
      provider,
      storyClusterId,
      scoreComponents,
      reasonCodes,
      candidateDigestInput,
    };
    return { ...body, digestInput: JSON.stringify(body) };
  });
  const selectedIds = new Set(orderedCandidateIds);
  const excluded = selection.selectedEvidence
    .filter((item) => !selectedIds.has(item.feedItemId))
    .map((item) => ({
      candidateId: item.feedItemId,
      canonicalIdentity: item.promotionFacts?.canonicalIdentity ?? "",
      reasonCodes: ["provider_floor_not_met"],
    }));
  const digestInputs = entries.map((entry) => entry.digestInput);
  return {
    policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
    top: entries,
    additional: [],
    excluded,
    orderedCandidateIds: entries.map((entry) => entry.candidateId),
    orderedCanonicalIdentities: entries.map(
      (entry) => entry.canonicalIdentity,
    ),
    digestInputs,
    digestMaterial: JSON.stringify({
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      sourceWindow: {
        windowId: selection.sourceWindow.windowId,
        startedAt: selection.sourceWindow.startedAt.toISOString(),
        endedAt: selection.sourceWindow.endedAt.toISOString(),
        periodStartedAt: (
          selection.sourceWindow.periodStartedAt ??
          selection.sourceWindow.startedAt
        ).toISOString(),
        periodEndedAt: (
          selection.sourceWindow.periodEndedAt ?? selection.sourceWindow.endedAt
        ).toISOString(),
        ingestionCutoff: (
          selection.sourceWindow.ingestionCutoff ??
          selection.sourceWindow.endedAt
        ).toISOString(),
      },
      orderedCandidateIds: entries.map((entry) => entry.candidateId),
      orderedCanonicalIdentities: entries.map(
        (entry) => entry.canonicalIdentity,
      ),
      digestInputs,
    }),
  };
};

const publicationEditorialProvider = (
  providerKey: string,
): ReaderSummaryEditorialSlateEntry["provider"] => providerKey === "reddit"
  ? "reddit"
  : providerKey === "hacker-news"
    ? "hacker_news"
    : providerKey === "github-repo-radar"
      ? "github"
      : "x";

const publicationEditorialScoreComponents = (
  evidence: SummaryEvidenceSelection["selectedEvidence"][number],
): ReaderSummaryEditorialScoreComponents => {
  const quality = evidence.contentQuality ?? publicationContentQuality;
  const metrics = evidence.promotionFacts?.metrics;
  const signal = metrics?.provider === "reddit"
    ? metrics.score
    : metrics?.provider === "hacker_news"
      ? metrics.points
      : 50;
  const relativePopularity = signal / 50;
  const engagementSalience = roundedPublicationScore(
    relativePopularity / (1 + relativePopularity),
  );
  const freshness = 1 / 3;
  const weightedEngagement = roundedPublicationScore(
    0.4 * engagementSalience,
  );
  const weightedRelevance = roundedPublicationScore(
    0.3 * quality.interestRelevanceScore,
  );
  const weightedEvidenceQuality = roundedPublicationScore(
    0.15 * quality.qualityScore,
  );
  const weightedIntegrity = roundedPublicationScore(
    0.1 * quality.engagementIntegrityScore,
  );
  const weightedFreshness = roundedPublicationScore(0.05 * freshness);
  return {
    engagementSalience,
    relevance: quality.interestRelevanceScore,
    evidenceQuality: quality.qualityScore,
    integrity: quality.engagementIntegrityScore,
    freshness,
    weightedEngagement,
    weightedRelevance,
    weightedEvidenceQuality,
    weightedIntegrity,
    weightedFreshness,
    total: roundedPublicationScore(
      weightedEngagement + weightedRelevance + weightedEvidenceQuality +
      weightedIntegrity + weightedFreshness,
    ),
  };
};

const roundedPublicationScore = (value: number): number =>
  Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
