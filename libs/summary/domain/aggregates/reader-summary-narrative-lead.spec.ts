import type {
  ReaderSummaryCitation,
  StoryCluster,
  SummaryEvidenceItem,
} from "../index";
import { buildReaderSummary } from "./reader-summary";

describe("ReaderSummary narrative projection under Promotion Policy V1", () => {
  it("does not let an authored narrative lead reorder Top and Additional lanes", () => {
    const top = evidence({
      id: "hn-top",
      providerKey: "hacker-news",
      title: "HN top engagement story",
      metrics: { provider: "hacker_news", points: 60 },
      contentKind: "story",
    });
    const additional = evidence({
      id: "reddit-additional",
      providerKey: "reddit",
      title: "Reddit additional story",
      metrics: {
        provider: "reddit",
        score: 25,
        upvoteRatio: 0.55,
      },
      contentKind: "original_post",
    });
    const summary = build([top, additional], additional);

    expect(summary.topReads.map((item) => item.title)).toEqual([top.title]);
    expect(summary.selectedPosts?.map((item) => item.title)).toEqual([
      additional.title,
    ]);
    expect(summary.narrativeSections).toEqual([
      expect.objectContaining({
        storyClusterId: `cluster:${additional.feedItemId}`,
        citationIds: [`citation:${additional.feedItemId}`],
      }),
    ]);
  });

  it("removes narrative and claim projections backed only by rejected evidence", () => {
    const official = evidence({
      id: "official-x",
      providerKey: "x-twitter",
      title: "Official Claude announcement",
      metrics: { provider: "x", likes: 50, reposts: 10, weightedScore: 70 },
      contentKind: "original_post",
      official: true,
    });
    const rejected = evidence({
      id: "reddit-seven-five",
      providerKey: "reddit",
      title: "Rejected Reddit discussion",
      metrics: { provider: "reddit", score: 7, upvoteRatio: 1 },
      contentKind: "original_post",
    });
    const summary = build([official, rejected], rejected);

    expect(summary.topReads.map((item) => item.title)).toEqual([official.title]);
    expect(summary.narrativeSections).toEqual([]);
    expect(summary.claimBoard.flatMap((claim) => claim.citationIds)).not.toContain(
      `citation:${rejected.feedItemId}`,
    );
    expect(summary.sourceMix.map((source) => source.providerKey)).toEqual([
      official.providerKey,
    ]);
  });

  it("does not refill a short lane from rejected model stories or cluster order", () => {
    const admitted = evidence({
      id: "only-admitted",
      providerKey: "hacker-news",
      title: "Only admitted story",
      metrics: { provider: "hacker_news", points: 50 },
      contentKind: "story",
    });
    const rejected = Array.from({ length: 12 }, (_, index) => evidence({
      id: `rejected-${index}`,
      providerKey: "reddit",
      title: `Rejected story ${index}`,
      metrics: {
        provider: "reddit",
        score: index % 8,
        upvoteRatio: 1,
      },
      contentKind: "original_post",
    }));
    const summary = build([...rejected.reverse(), admitted]);

    expect(summary.topReads.map((item) => item.title)).toEqual([admitted.title]);
    expect(summary.selectedPosts).toHaveLength(0);
  });
});

const build = (
  evidenceItems: readonly SummaryEvidenceItem[],
  narrativeLead?: SummaryEvidenceItem,
) => buildReaderSummary({
  headline: "Authored summary headline",
  executiveSummary: "Authored summary content.",
  narrativeSections: narrativeLead === undefined ? [] : [{
    id: "authored-lead",
    kind: "lead",
    title: narrativeLead.title,
    text: narrativeLead.title,
    citationIds: [`citation:${narrativeLead.feedItemId}`],
    storyClusterId: `cluster:${narrativeLead.feedItemId}`,
  }],
  topStories: [...evidenceItems].reverse().map((item) => ({
    storyClusterId: `cluster:${item.feedItemId}`,
    title: item.title,
    summary: item.title,
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    citationIds: [`citation:${item.feedItemId}`],
  })),
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: evidenceItems.map(citation),
  storyClusters: evidenceItems.map(cluster),
  sourceWindow: {
    windowId: "promotion-narrative-window",
    startedAt: new Date("2026-08-14T00:00:00.000Z"),
    endedAt: new Date("2026-08-15T00:00:00.000Z"),
    periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
    periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
    ingestionCutoff: new Date("2026-08-15T00:00:00.000Z"),
    selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
    storyClusterIds: evidenceItems.map((item) => `cluster:${item.feedItemId}`),
  },
  selectedEvidence: evidenceItems,
  qualityFlags: [],
});

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly title: string;
  readonly metrics: NonNullable<
    NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]
  >;
  readonly contentKind: NonNullable<
    SummaryEvidenceItem["promotionFacts"]
  >["contentKind"];
  readonly official?: boolean;
}): SummaryEvidenceItem => ({
  feedItemId: params.id,
  sourceItemId: `source:${params.id}`,
  sourceBindingId: `binding:${params.providerKey}`,
  interestId: "interest:ai-developer-tools",
  providerKey: params.providerKey,
  providerName: params.providerKey,
  canonicalUrl: `https://example.test/${params.id}`,
  title: params.title,
  publishedAt: new Date("2026-08-14T12:00:00.000Z"),
  observedAt: new Date("2026-08-14T12:05:00.000Z"),
  score: 999,
  whyImportant: [params.title],
  providerMetricLabels: metricLabels(params.metrics),
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "eligible",
    flags: params.official === true
      ? ["official_account", "trusted_author"]
      : [],
    reason: "Promotion narrative fixture.",
  },
  promotionFacts: {
    contentKind: params.contentKind,
    canonicalIdentity: `identity:${params.id}`,
    officialAccount: params.official === true,
    trustedAuthor: params.official === true,
    safetyValid: true,
    freshnessValid: true,
    freshnessProvenance: {
      status: "observed",
      publishedAt: new Date("2026-08-14T12:00:00.000Z"),
      observedAt: new Date("2026-08-14T12:05:00.000Z"),
      ingestionCutoff: new Date("2026-08-15T00:00:00.000Z"),
    },
    metrics: params.metrics,
  },
});

const citation = (item: SummaryEvidenceItem): ReaderSummaryCitation => ({
  citationId: `citation:${item.feedItemId}`,
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  providerKey: item.providerKey,
  field: "title",
  canonicalUrl: item.canonicalUrl,
});

const cluster = (item: SummaryEvidenceItem): StoryCluster => ({
  id: `cluster:${item.feedItemId}`,
  storyKey: `story:${item.feedItemId}`,
  representativeFeedItemId: item.feedItemId,
  duplicateFeedItemIds: [],
  interestIds: [item.interestId],
  providerKeys: [item.providerKey],
  score: 999,
  observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
  whyImportant: [item.title],
});

const metricLabels = (
  metrics: NonNullable<NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]>,
) => {
  switch (metrics.provider) {
    case "x":
      return [{ label: "Likes", value: String(metrics.likes) }];
    case "reddit":
      return [{ label: "Score", value: String(metrics.score) }];
    case "hacker_news":
      return [{ label: "Points", value: String(metrics.points) }];
    case "github_radar":
      return [];
  }
};
