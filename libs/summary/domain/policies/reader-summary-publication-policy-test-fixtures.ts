import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
import { buildReaderPostPromotionProjection } from "../services/reader-post-promotion-projection";
import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import {
  publicationCitation,
  publicationContentQuality,
  publicationStoryCluster,
} from "./reader-summary-publication-policy.spec-support";

export const artifact = (
  overrides: Partial<Parameters<typeof ReaderSummaryArtifact.create>[0]> = {},
): ReaderSummaryArtifact => {
  const props: Parameters<typeof ReaderSummaryArtifact.create>[0] = {
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-publication-1",
    tenantId: tenantId("tenant-reader-summary-publication"),
    workspaceId: workspaceId("workspace-reader-summary-publication"),
    scope: { type: "workspace" },
    period: period(),
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
    storyClusters: [
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
    contextArtifacts: [],
    headline: "Developers weigh AI runtime quality",
    executiveSummary: "A cited source backs the runtime quality discussion.",
    content: content(),
    topStories: [
      {
        storyClusterId: "story-publication-1",
        title: "AI runtime quality discussion",
        summary: "A cited source backs the runtime quality discussion.",
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        citationIds: ["citation-publication-1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "citation-publication-1",
        feedItemId: "feed-publication-1",
        sourceItemId: "source-publication-1",
        providerKey: "reddit",
        field: "title",
        canonicalUrl: "https://reddit.example.test/post",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.7,
      rationale: "The cited discussion supports the summary.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "publication-policy-test",
      providerVersion: "deterministic-local",
      rulesVersion: "reader-summary.rules.test.v1",
      evalDatasetVersion: "reader-summary.eval.test.v1",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0,
    },
    ...overrides,
  };
  if (props.content === undefined) {
    return ReaderSummaryArtifact.create({
      ...props,
      promotionAttestations: [],
    });
  }
  const fixtureEvidence = evidenceSelection();
  const promotion = buildReaderPostPromotionProjection({
    evidence: fixtureEvidence.selectedEvidence,
    clusters: props.storyClusters,
    citations: props.citationMap,
    sourceWindow: props.sourceWindow,
    attestationBinding: {
      artifactId: props.readerSummaryId,
      sourceWindow: props.sourceWindow,
    },
  });
  return ReaderSummaryArtifact.create({
    ...props,
    promotionAttestations:
      overrides.promotionAttestations ?? promotion.attestations,
    promotionEvidenceFacts: promotion.attestedEvidenceFacts,
  });
};

export const content = (overrides: Partial<ReaderSummaryContent> = {}) => {
  const topRead = {
    storyClusterId: "story-publication-1",
    cardKind: "curated_top_read" as const,
    promotionMarker: "reader_post_promotion" as const,
    promotionPolicyVersion: "reader_post_promotion.v1" as const,
    promotionTier: "top" as const,
    promotionCandidateId: "feed-publication-1",
    promotionCanonicalIdentity: "url:https://reddit.example.test/post",
    title: "AI runtime quality discussion",
    providerKey: "reddit",
    providerName: "Reddit",
    primaryActionKind: "read_source" as const,
    reason: "It is relevant to the monitored topic.",
    matchedInterestIds: ["interest-ai"],
    matchedRules: ["ai"],
    signalScore: 1,
    confidence: {
      level: "medium" as const,
      score: 0.7,
      rationale: "The cited discussion supports the summary.",
    },
    confirmedProviderKeys: ["reddit"],
    providerMetrics: [],
    whyImportant: ["Relevant discussion"],
    whyNow: "It appeared in the current summary window.",
    canonicalUrl: "https://reddit.example.test/post",
    citationIds: ["citation-publication-1"],
  };
  return {
    headline: "Developers weigh AI runtime quality",
    oneLineTakeaway: "A cited source backs the runtime quality discussion.",
    bullets: ["A cited Reddit source is relevant."],
    narrativeSections: [
      {
        id: "narrative-publication-lead",
        kind: "lead" as const,
        title: "Main signal",
        text: "A cited source backs the runtime quality discussion.",
        citationIds: ["citation-publication-1"],
        storyClusterId: "story-publication-1",
      },
    ],
    qualityState: {
      status: "ready" as const,
      flags: [],
      warnings: [],
      isSingleSource: true,
    },
    interestSections: [],
    sourceMix: [
      {
        providerKey: "reddit",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        interestIds: ["interest-ai"],
      },
    ],
    topReads: [topRead],
    selectedPosts: [],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: ["1 Reddit item selected"],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
    ...overrides,
  };
};

export const dailySynthesisArtifact = (
  overrides: {
    readonly headline?: string;
    readonly executiveSummary?: string;
    readonly watchText?: string;
    readonly narrativeSections?: NonNullable<
      ReaderSummaryContent["narrativeSections"]
    >;
  } = {},
): ReaderSummaryArtifact => {
  const headline = overrides.headline ?? "AI workflows draw broader scrutiny";
  const storyClusters = [
    publicationStoryCluster(),
    publicationStoryCluster({
      id: "story-publication-2",
      representativeFeedItemId: "feed-publication-2",
      providerKeys: ["hacker-news"],
    }),
  ];
  const citationMap = [
    publicationCitation(),
    publicationCitation({
      citationId: "citation-publication-2",
      feedItemId: "feed-publication-2",
      sourceItemId: "source-publication-2",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.example.test/item/2",
    }),
  ];
  return artifact({
    headline,
    executiveSummary:
      overrides.executiveSummary ??
      "Reddit and Hacker News surface distinct AI workflow signals.",
    sourceWindow: {
      windowId: "window-publication",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["feed-publication-1", "feed-publication-2"],
      storyClusterIds: storyClusters.map((cluster) => cluster.id),
      periodStartedAt: new Date("2026-07-05T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-06T00:00:00.000Z"),
      ingestionCutoff: new Date("2026-07-05T09:00:00.000Z"),
    },
    storyClusters,
    citationMap,
    content: content({
      headline,
      narrativeSections:
        overrides.narrativeSections ??
        [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: ["citation-publication-1", "citation-publication-2"],
          },
          ...(overrides.watchText === undefined
            ? []
            : [
                {
                  id: "narrative-publication-watch",
                  kind: "watch" as const,
                  title: "Watch",
                  text: overrides.watchText,
                  citationIds: ["citation-publication-1"],
                },
              ]),
        ],
    }),
  });
};

export const providerDominatedDailySynthesisArtifact = (): ReaderSummaryArtifact => {
  const thirdCluster = publicationStoryCluster({
    id: "story-publication-3",
    representativeFeedItemId: "feed-publication-3",
    duplicateFeedItemIds: ["feed-publication-4", "feed-publication-5"],
  });
  const base = dailySynthesisArtifact().toSnapshot();
  const extraCitations = [3, 4, 5].map((index) =>
    publicationCitation({
      citationId: `citation-publication-${index}`,
      feedItemId: `feed-publication-${index}`,
      sourceItemId: `source-publication-${index}`,
      canonicalUrl: `https://reddit.example.test/post/${index}`,
    }),
  );
  return artifact({
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [
        ...base.sourceWindow.selectedFeedItemIds,
        "feed-publication-3",
        "feed-publication-4",
        "feed-publication-5",
      ],
      storyClusterIds: [...base.sourceWindow.storyClusterIds, thirdCluster.id],
    },
    storyClusters: [...base.storyClusters, thirdCluster],
    citationMap: [...base.citationMap, ...extraCitations],
    content: content({
      headline: base.content?.headline ?? base.headline,
      narrativeSections: [
        ...(base.content?.narrativeSections ?? []),
        {
          id: "narrative-publication-secondary",
          kind: "secondary_signal",
          title: "Community follow-up",
          text: "Three Reddit citations expand the secondary signal.",
          citationIds: extraCitations.map((citation) => citation.citationId),
          storyClusterId: thirdCluster.id,
        },
      ],
    }),
  });
};

export const evidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceContentQuality;
  } = {},
): SummaryEvidenceSelection => ({
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
      contentQuality: overrides.firstContentQuality ?? publicationContentQuality,
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
});
export const dailyEvidenceSelection = (secondPoints = 0): SummaryEvidenceSelection => {
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
  return {
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
};

export const period = () => ({
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
});
