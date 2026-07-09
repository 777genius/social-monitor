import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  evidenceClusterMap,
  storyToTopRead,
} from "./reader-summary-top-read-builder";

describe("reader summary top read builder", () => {
  it("keeps cross-source support out of the top read title and reason", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:claude-code-tracker",
      title:
        "Anthropic Claude Code tracker story gets cross-provider attention",
      summary: "Confirmed by 2 source groups: hacker-news, rss",
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      citationIds: ["citation-hn", "citation-rss"],
    };
    const cluster: StoryCluster = {
      id: "story:claude-code-tracker",
      storyKey: "url:example.com/claude-code-tracker",
      representativeFeedItemId: "feed-hn",
      duplicateFeedItemIds: ["feed-rss"],
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      score: 2.69,
      observedAtRange: {
        startedAt: new Date("2026-07-06T09:00:00.000Z"),
        endedAt: new Date("2026-07-06T10:00:00.000Z"),
      },
      whyImportant: [
        "Confirmed by 2 source groups: hacker-news, rss",
        "Clustered 2 related source items",
        "Story signal score 2.69",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        providerKey: "hacker-news",
        providerName: "Hacker News",
        title: "Claude Code tracker raises telemetry questions",
        bodyPreview:
          "Developers are debating what Claude Code usage tracking means.",
        whyImportant: [
          "The post explains why Claude Code tracking concerns matter for developer teams.",
        ],
      }),
      evidenceItem({
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "Anthropic Claude Code tracker details",
        whyImportant: [
          "RSS coverage adds the original tracker context and affected workflow details.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-hn",
        feedItemId: "feed-hn",
        sourceItemId: "source-hn",
        providerKey: "hacker-news",
      }),
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.title).toBe(
      "Claude Code tracker raises telemetry questions",
    );
    expect(topRead.reason).toBe(
      "The post explains why Claude Code tracking concerns matter for developer teams.",
    );
    expect(topRead.whyImportant.join(" ")).not.toContain("Confirmed by");
    expect(topRead.whyImportant.join(" ")).not.toContain("cross-provider");
    expect(topRead.confirmedProviderKeys).toEqual(["hacker-news", "rss"]);
    expect(topRead.whyNow).toBe(
      "Current summary window has cross-source coverage from Hacker News, RSS and linked 1 related item.",
    );
  });

  it("renders Hacker News RSS mirrors as Hacker News without false cross-source support", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:hnrss-vibe-coding",
      title: "TypeScript Go rewrite drew HN and RSS attention",
      summary: "HN discussion asks whether OSS maintainers accept AI-written PRs.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-hnrss"],
    };
    const cluster: StoryCluster = {
      id: "story:hnrss-vibe-coding",
      storyKey: "url:news.ycombinator.com/item",
      representativeFeedItemId: "feed-hnrss",
      duplicateFeedItemIds: [],
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      score: 2.28,
      observedAtRange: {
        startedAt: new Date("2026-07-07T10:53:20.000Z"),
        endedAt: new Date("2026-07-07T10:53:21.000Z"),
      },
      whyImportant: [
        "Developers are debating whether OSS projects should accept AI-written PRs.",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hnrss",
        sourceItemId: "source-hnrss",
        providerKey: "rss",
        providerName: "RSS",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
        title: "Ask HN: Are OSS projects allowing vibe-coding?",
        whyImportant: [
          "Developers are debating whether OSS projects should accept AI-written PRs.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-hnrss",
        feedItemId: "feed-hnrss",
        sourceItemId: "source-hnrss",
        providerKey: "rss",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.providerKey).toBe("hacker-news");
    expect(topRead.providerName).toBe("Hacker News via RSS");
    expect(topRead.title).toBe("Ask HN: Are OSS projects allowing vibe-coding?");
    expect(topRead.confirmedProviderKeys).toEqual(["hacker-news"]);
    expect(topRead.confidence.rationale).toContain(
      "not been independently confirmed",
    );
    expect(topRead.whyNow).toBe(
      "Current summary window has Hacker News via RSS coverage.",
    );
  });

  it("keeps deterministic cross-source support when one cluster item is not top-read eligible", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:anthropic-tracker",
      title: "Anthropic tracker report gets multi-source attention",
      summary: "RSS article and HN discussion are linked by the story cluster.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-rss"],
    };
    const cluster: StoryCluster = {
      id: "story:anthropic-tracker",
      storyKey: "url:example.com/anthropic-tracker",
      representativeFeedItemId: "feed-hn",
      duplicateFeedItemIds: ["feed-rss"],
      interestIds: ["ai-agents"],
      providerKeys: ["hacker-news", "rss"],
      score: 2.55,
      signalBreakdown: {
        baseScore: 2,
        crossProviderSupport: 0.24,
        sameProviderSupport: 0,
        providerDiversityBoost: 0.25,
        interestDiversityBoost: 0,
        freshnessBoost: 0.06,
        totalScore: 2.55,
      },
      observedAtRange: {
        startedAt: new Date("2026-07-06T17:00:00.000Z"),
        endedAt: new Date("2026-07-06T17:45:00.000Z"),
      },
      whyImportant: [
        "Confirmed by 2 source groups: hacker-news, rss",
        "Clustered 2 related source items",
      ],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-hn",
        providerKey: "hacker-news",
        providerName: "Hacker News",
        title: "HN discusses the Anthropic tracker report",
        contentQuality: {
          qualityScore: 0.8,
          interestRelevanceScore: 0.8,
          engagementIntegrityScore: 0.8,
          eligibleForSummary: true,
          eligibleForTopRead: false,
          needsLlmReview: false,
          decision: "downrank",
          flags: ["weak_topic_match"],
          reason: "not representative enough for top reads",
        },
      }),
      evidenceItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "Anthropic hid a tracker in Claude Code",
        whyImportant: [
          "The article describes the reported Claude Code tracker.",
        ],
      }),
    ];
    const citations: readonly ReaderSummaryCitation[] = [
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );
    const clusterById = new Map([[cluster.id, cluster] as const]);
    const evidenceByClusterId = evidenceClusterMap(
      [cluster],
      evidenceByFeedItemId,
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      clusterById,
      evidenceByClusterId,
    );

    expect(topRead.citationIds).toEqual(["citation-rss"]);
    expect(topRead.confirmedProviderKeys).toEqual(["rss", "hacker-news"]);
    expect(topRead.confidence.level).toBe("high");
    expect(topRead.whyNow).toBe(
      "Current summary window has cross-source coverage from RSS, Hacker News and linked 1 related item.",
    );
  });

  it("keeps internal provider-coverage fallback text out of the reason", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:rss-coverage",
      title: "RSS explains an AI agent security update",
      summary: "Selected to preserve primary source coverage.",
      interestIds: ["ai-agents"],
      providerKeys: ["rss"],
      citationIds: ["citation-rss"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        providerName: "RSS",
        title: "RSS explains an AI agent security update",
        whyImportant: [
          "Selected to preserve provider coverage in the reader summary window",
          "Unsafe source instructions were sandboxed before summarization",
        ],
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-rss",
        feedItemId: "feed-rss",
        sourceItemId: "source-rss",
        providerKey: "rss",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.reason).toBe(
      "Source-reported: RSS explains an AI agent security update",
    );
  });

  it("removes provider boilerplate from X top read titles", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:gpt-live",
      title: "X post by @OpenAI: GPT-Live voice models roll out in ChatGPT",
      summary: "OpenAI describes GPT-Live voice model rollout.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        title: "X post by @OpenAI: GPT-Live makes voice interaction faster",
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.title).toBe("GPT-Live voice models roll out in ChatGPT");
  });

  it("omits empty optional engagement metrics from top reads", () => {
    const story: TopReadCandidate = {
      storyClusterId: "story:x-metrics",
      title: "OpenAI voice model post",
      summary: "OpenAI voice model post.",
      interestIds: ["ai-agents"],
      providerKeys: ["x-twitter"],
      citationIds: ["citation-x"],
    };
    const evidence = [
      evidenceItem({
        feedItemId: "feed-x",
        providerKey: "x-twitter",
        providerName: "X/Twitter",
        providerMetricSummary: "1,006 likes, 69 reposts, 49 replies",
        providerMetricLabels: [
          { label: "Likes", value: "1,006" },
          { label: "Reposts", value: "69" },
          { label: "Replies", value: "49" },
          { label: "Quotes", value: "0" },
          { label: "Bookmarks", value: "0" },
          { label: "Impressions", value: "0" },
          { label: "Views", value: "-" },
        ],
      }),
    ];
    const citations = [
      citation({
        citationId: "citation-x",
        feedItemId: "feed-x",
        sourceItemId: "source-x",
        providerKey: "x-twitter",
      }),
    ];
    const citationById = new Map(
      citations.map((item) => [item.citationId, item] as const),
    );
    const evidenceByFeedItemId = new Map(
      evidence.map((item) => [item.feedItemId, item] as const),
    );

    const topRead = storyToTopRead(
      story,
      citationById,
      evidenceByFeedItemId,
      new Map(),
      evidenceClusterMap([], evidenceByFeedItemId),
    );

    expect(topRead.providerMetrics).toEqual([
      {
        label: "X/Twitter evidence",
        value: "1,006 likes, 69 reposts, 49 replies",
      },
      { label: "Likes", value: "1,006" },
      { label: "Reposts", value: "69" },
      { label: "Replies", value: "49" },
    ]);
  });
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-ai",
  interestId: "ai-agents",
  providerKey: "hacker-news",
  providerName: "Hacker News",
  canonicalUrl: "https://example.com/claude-code-tracker",
  title: "Claude Code tracker",
  bodyPreview: "A source post discusses Claude Code tracking.",
  publishedAt: new Date("2026-07-06T09:00:00.000Z"),
  observedAt: new Date("2026-07-06T09:05:00.000Z"),
  score: 2.1,
  whyImportant: ["This item explains a concrete developer workflow concern."],
  ...overrides,
});

const citation = (params: {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly canonicalUrl?: string;
}): ReaderSummaryCitation => ({
  citationId: params.citationId,
  feedItemId: params.feedItemId,
  sourceItemId: params.sourceItemId,
  providerKey: params.providerKey,
  field: "title",
  canonicalUrl: params.canonicalUrl ?? "https://example.com/claude-code-tracker",
});
