import type {
  ApprovedSameStoryRelation,
  ReaderSummaryCitation,
  StoryCluster,
  SummaryEvidenceItem,
} from "../index";
import { buildReaderSummary } from "./reader-summary";

describe("reader summary Promotion Policy V1 production path", () => {
  it("materializes Aug 14 Cursor HN plus official X as one cross-source story", () => {
    const hn = evidence({
      id: "cursor-hn",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=44123",
      title: "Cursor ships a major agent update",
      metrics: { provider: "hacker_news", points: 80 },
      contentKind: "story",
    });
    const official = evidence({
      id: "cursor-x-official",
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/cursor_ai/status/1956000000000000000",
      title: "Cursor announces the agent update",
      metrics: { provider: "x", likes: 21, reposts: 7, weightedScore: 35 },
      contentKind: "original_post",
      official: true,
    });
    const summary = build([hn, official], [
      approvedRelation(hn, official, 0.92),
    ]);

    expect(summary.topReads).toHaveLength(1);
    expect(summary.selectedPosts).toEqual([]);
    expect(summary.topReads[0]).toMatchObject({
      title: hn.title,
      providerKey: "hacker-news",
      confirmedProviderKeys: ["hacker-news", "x-twitter"],
      citationIds: ["citation:cursor-hn", "citation:cursor-x-official"],
    });
    expect(summary.sourceMix).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerKey: "hacker-news", crossSourceClusterCount: 1 }),
      expect.objectContaining({ providerKey: "x-twitter", crossSourceClusterCount: 1 }),
    ]));
  });

  it("materializes the Aug 14 Claude watermark sources as one cross-source story", () => {
    const official = evidence({
      id: "aug14-watermark-official",
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/AnthropicAI/status/1956000000000000002",
      title: "Anthropic adds a watermark to Claude-generated snippets",
      metrics: { provider: "x", likes: 42, reposts: 12, weightedScore: 66 },
      contentKind: "original_post",
      official: true,
    });
    const hn = evidence({
      id: "aug14-watermark-hn",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=44124",
      title: "Watermarking Claude Code output",
      metrics: { provider: "hacker_news", points: 75 },
      contentKind: "story",
    });
    const summary = build([official, hn], [approvedRelation(official, hn, 0.94)]);

    expect(summary.topReads).toHaveLength(1);
    expect(summary.topReads[0]).toMatchObject({
      confirmedProviderKeys: ["hacker-news", "x-twitter"],
      citationIds: [
        "citation:aug14-watermark-hn",
        "citation:aug14-watermark-official",
      ],
    });
    expect(summary.selectedPosts).toEqual([]);
    expect(summary.sourceMix).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerKey: "hacker-news",
        crossSourceClusterCount: 1,
      }),
      expect.objectContaining({
        providerKey: "x-twitter",
        crossSourceClusterCount: 1,
      }),
    ]));
  });

  it("keeps Reddit 0/19 and 7/5 out of every lane and unable to boost the lead", () => {
    const lead = evidence({
      id: "lead-hn",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=50000",
      title: "A qualifying HN story",
      metrics: { provider: "hacker_news", points: 55 },
      contentKind: "story",
    });
    const lowZero = evidence({
      id: "reddit-zero",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/ai/comments/zero/story",
      title: "Low Reddit discussion zero",
      metrics: { provider: "reddit", score: 0 },
      contentKind: "original_post",
    });
    const lowSeven = evidence({
      id: "reddit-seven",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/ai/comments/seven/story",
      title: "Low Reddit discussion seven",
      metrics: { provider: "reddit", score: 7 },
      contentKind: "original_post",
    });
    const baseline = build([lead]);
    const noisy = build([lead, lowZero, lowSeven]);

    expect(noisy.topReads).toEqual(baseline.topReads);
    expect(noisy.selectedPosts).toEqual(baseline.selectedPosts);
    expect(noisy.sourceMix).toEqual(baseline.sourceMix);
    expect(noisy.interestSections.every((section) =>
      section.items.length === 0 && section.citationIds.length > 0,
    )).toBe(true);
    expect(JSON.stringify(noisy)).not.toContain("reddit-zero");
    expect(JSON.stringify(noisy)).not.toContain("reddit-seven");
  });

  it("hides related-only evidence even when it clears an engagement floor", () => {
    const official = evidence({
      id: "official-x",
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/anthropic/status/1956000000000000001",
      title: "Official Claude announcement",
      metrics: { provider: "x", likes: 100, reposts: 30, weightedScore: 160 },
      contentKind: "original_post",
      official: true,
    });
    const related = evidence({
      id: "related-reddit",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/claude/comments/related/question",
      title: "A related but different Reddit topic",
      metrics: { provider: "reddit", score: 80 },
      contentKind: "original_post",
    });
    const summary = build([official, related], [], [{
      relationId: "related-topic:v1:reddit:related-reddit:x-twitter:official-x",
      subjectStoryClusterId: "cluster:related-reddit",
      targetStoryClusterId: "cluster:official-x",
      subjectFeedItemId: related.feedItemId,
      subjectProviderKey: related.providerKey,
      subjectSourceItemId: related.sourceItemId,
      subjectCanonicalUrl: related.canonicalUrl,
      subjectProviderMetrics: related.providerMetricLabels ?? [],
      officialAnchorFeedItemId: official.feedItemId,
      officialAnchorProviderKey: official.providerKey,
      officialAnchorSourceItemId: official.sourceItemId,
      officialAnchorContentQuality: official.contentQuality!,
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
    }]);

    expect(summary.topReads.map((item) => item.title)).toEqual([official.title]);
    expect(summary.selectedPosts).toEqual([]);
  });

  it("does not overmerge a shared canonical hint across distinct semantic clusters", () => {
    const top = evidence({
      id: "duplicate-top",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=60000",
      canonicalIdentity: "story:shared-canonical",
      title: "Shared canonical top",
      metrics: { provider: "hacker_news", points: 60 },
      contentKind: "story",
    });
    const additional = evidence({
      id: "duplicate-additional",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=60001",
      canonicalIdentity: "story:shared-canonical",
      title: "Shared canonical additional",
      metrics: { provider: "hacker_news", points: 30 },
      contentKind: "story",
    });
    const summary = build([top, additional]);

    expect(summary.topReads).toHaveLength(1);
    expect(summary.topReads[0]?.title).toBe(top.title);
    expect(summary.selectedPosts).toHaveLength(1);
    expect(summary.selectedPosts?.[0]?.title).toBe(additional.title);
  });

  it("does not let a rejected high-metric same-story candidate suppress the valid lead", () => {
    const valid = evidence({
      id: "valid-lead",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=61000",
      title: "Valid same-story lead",
      metrics: { provider: "hacker_news", points: 50 },
      contentKind: "story",
    });
    const rejectedBase = evidence({
      id: "rejected-high-metric",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=61001",
      title: "Rejected high-metric candidate",
      metrics: { provider: "hacker_news", points: 5_000 },
      contentKind: "story",
    });
    const rejected = {
      ...rejectedBase,
      contentQuality: {
        ...rejectedBase.contentQuality!,
        eligibleForTopRead: false,
        decision: "reject",
      },
    };
    const summary = build(
      [rejected, valid],
      [approvedRelation(rejected, valid, 0.99)],
    );

    expect(summary.topReads.map((item) => item.title)).toEqual([valid.title]);
    expect(JSON.stringify(summary)).not.toContain(rejected.title);
  });

  it("allows short lanes, never backfills rejects, and caps each lane at eight", () => {
    const top = Array.from({ length: 10 }, (_, index) => evidence({
      id: `top-${index}`,
      providerKey: "hacker-news",
      canonicalUrl: `https://news.ycombinator.com/item?id=70${index}`,
      title: `Top ${index}`,
      metrics: { provider: "hacker_news", points: 50 + index },
      contentKind: "story",
    }));
    const additional = Array.from({ length: 10 }, (_, index) => evidence({
      id: `additional-${index}`,
      providerKey: "hacker-news",
      canonicalUrl: `https://news.ycombinator.com/item?id=80${index}`,
      title: `Additional ${index}`,
      metrics: { provider: "hacker_news", points: 25 + index },
      contentKind: "story",
    }));
    const rejects = Array.from({ length: 5 }, (_, index) => evidence({
      id: `reject-${index}`,
      providerKey: "reddit",
      canonicalUrl: `https://reddit.com/r/ai/comments/reject${index}/story`,
      title: `Reject ${index}`,
      metrics: { provider: "reddit", score: index },
      contentKind: "original_post",
    }));
    const summary = build([...top, ...additional, ...rejects]);

    expect(summary.topReads).toHaveLength(8);
    expect(summary.selectedPosts?.filter(
      (item) => item.cardKind === "additional_notable_story",
    )).toHaveLength(8);
    expect(summary.selectedPosts).toHaveLength(8);
    expect(summary.selectedPosts?.some((item) =>
      item.title.startsWith("Reject"),
    )).toBe(false);
  });

  it("fails a mismatched citation closed at the production projection boundary", () => {
    const lead = evidence({
      id: "citation-mismatch",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=90000",
      title: "Citation identity must match",
      metrics: { provider: "hacker_news", points: 80 },
      contentKind: "story",
    });
    const mismatchedCitation = {
      ...citation(lead),
      sourceItemId: "different-source-item",
    };

    const summary = build([lead], [], [], [mismatchedCitation]);

    expect(summary.topReads).toEqual([]);
    expect(summary.selectedPosts).toEqual([]);
    expect(summary.qualityState.status).toBe("no_signal");
  });
});

const build = (
  evidenceItems: readonly SummaryEvidenceItem[],
  approvedSameStoryRelations: readonly ApprovedSameStoryRelation[] = [],
  relatedTopicRelations: Parameters<typeof buildReaderSummary>[0]["relatedTopicRelations"] = [],
  citationMap: readonly ReaderSummaryCitation[] = evidenceItems.map(citation),
) => buildReaderSummary({
  headline: "Promotion Policy V1 summary",
  executiveSummary: "Only admitted post evidence is reader-visible.",
  topStories: evidenceItems.map((item) => ({
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
  citationMap,
  storyClusters: evidenceItems.map(cluster),
  sourceWindow: {
    windowId: "window:aug-14",
    startedAt: new Date("2026-08-14T00:00:00.000Z"),
    endedAt: new Date("2026-08-15T00:00:00.000Z"),
    periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
    periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
    ingestionCutoff: new Date("2026-08-15T01:00:00.000Z"),
    selectedFeedItemIds: evidenceItems.map((item) => item.feedItemId),
    storyClusterIds: evidenceItems.map((item) => `cluster:${item.feedItemId}`),
  },
  selectedEvidence: evidenceItems,
  approvedSameStoryRelations,
  relatedTopicRelations,
  qualityFlags: [],
});

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly canonicalIdentity?: string;
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
  sourceItemId: params.id,
  sourceBindingId: `binding:${params.providerKey}`,
  interestId: "interest:ai-developer-tools",
  providerKey: params.providerKey,
  providerName: params.providerKey,
  canonicalUrl: params.canonicalUrl,
  title: params.title,
  bodyPreview: params.title,
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
    decision: "promote",
    flags: params.official === true
      ? ["official_account", "trusted_author"]
      : [],
    reason: "Production aggregate promotion fixture",
  },
  promotionFacts: {
    contentKind: params.contentKind,
    canonicalIdentity: params.canonicalIdentity ?? `identity:${params.id}`,
    ...(params.official === true
      ? {
          authorityAttestation: {
            status: "attested" as const,
            official: true,
            trusted: true,
            attestedBy: "source_catalog" as const,
          },
        }
      : {}),
    safetyValid: true,
    freshnessValid: true,
    freshnessProvenance: {
      status: "observed",
      publishedAt: new Date("2026-08-14T12:00:00.000Z"),
      observedAt: new Date("2026-08-14T12:05:00.000Z"),
      ingestionCutoff: new Date("2026-08-15T01:00:00.000Z"),
    },
    metrics: params.metrics,
  },
});

const citation = (item: SummaryEvidenceItem): ReaderSummaryCitation => ({
  citationId: `citation:${item.feedItemId}`,
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  providerKey: item.providerKey,
  field: "canonicalUrl",
  canonicalUrl: item.canonicalUrl,
});

const cluster = (item: SummaryEvidenceItem): StoryCluster => ({
  id: `cluster:${item.feedItemId}`,
  storyKey: `story:${item.feedItemId}`,
  rankingPolicyVersion: "story-ranking.v1",
  representativeFeedItemId: item.feedItemId,
  duplicateFeedItemIds: [],
  interestIds: [item.interestId],
  providerKeys: [item.providerKey],
  score: 999,
  observedAtRange: {
    startedAt: item.observedAt,
    endedAt: new Date(item.observedAt.getTime() + 1),
  },
  whyImportant: ["Rejected aggregate counts must not be reused."],
});

const approvedRelation = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
  confidence: number,
): ApprovedSameStoryRelation => ({
  leftFeedItemId: left.feedItemId,
  rightFeedItemId: right.feedItemId,
  confidence,
});

const metricLabels = (
  metrics: NonNullable<NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]>,
) => {
  switch (metrics.provider) {
    case "x":
      return [
        { label: "Likes", value: String(metrics.likes) },
        { label: "Reposts", value: String(metrics.reposts) },
      ];
    case "reddit":
      return [{ label: "Score", value: String(metrics.score) }];
    case "hacker_news":
      return [{ label: "Points", value: String(metrics.points) }];
    case "github_radar":
      return [];
  }
};
