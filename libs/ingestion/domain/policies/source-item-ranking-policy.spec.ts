import {
  createSourceItemRankingPlan,
  rankSourceItems,
  sourceItemRankingBreakdown,
  sourceItemEngagementScore,
  sourceItemRelevanceScore,
} from "./source-item-ranking-policy";

describe("source item ranking policy", () => {
  it("uses relevance-first ranking by default with capped engagement as a bonus", () => {
    const plan = createSourceItemRankingPlan({
      queries: ["Claude Code MCP server reliability"],
    });
    const items = [
      sourceItem({
        title: "Huge unrelated launch thread",
        body: "General startup chatter.",
        score: 10_000,
        comments: 2_000,
      }),
      sourceItem({
        title: "Claude Code MCP server reliability notes",
        body: "Maintainers compare retries, auth and tool failures.",
        score: 20,
        comments: 3,
      }),
    ];

    expect(rankSourceItems(items, plan).map((item) => item.title)).toEqual([
      "Claude Code MCP server reliability notes",
      "Huge unrelated launch thread",
    ]);
  });

  it("keeps engagement-first ranking available for trend discovery", () => {
    const plan = createSourceItemRankingPlan({
      mode: "engagement",
      queries: ["Claude Code MCP server reliability"],
    });
    const items = [
      sourceItem({
        title: "Claude Code MCP server reliability notes",
        score: 20,
        comments: 3,
      }),
      sourceItem({
        title: "Huge unrelated launch thread",
        score: 10_000,
        comments: 2_000,
      }),
    ];

    expect(rankSourceItems(items, plan).map((item) => item.title)).toEqual([
      "Huge unrelated launch thread",
      "Claude Code MCP server reliability notes",
    ]);
  });

  it("rejects unsupported ranking modes instead of silently changing behavior", () => {
    expect(() =>
      createSourceItemRankingPlan({ mode: "relevnace", queries: ["OpenAI"] }),
    ).toThrow("Unsupported source ranking mode");
  });

  it("allows hybrid ranking to surface very high engagement near relevant items", () => {
    const plan = createSourceItemRankingPlan({
      mode: "hybrid",
      queries: ["OpenAI Codex MCP"],
    });
    const weakRelevant = sourceItem({
      title: "MCP integration notes",
      score: 3,
      comments: 0,
    });
    const highEngagement = sourceItem({
      title: "OpenAI developer tools discussion",
      score: 5_000,
      comments: 800,
    });

    expect(rankSourceItems([weakRelevant, highEngagement], plan)[0]).toBe(
      highEngagement,
    );
  });

  it("reads engagement metrics from Reddit and X-shaped metadata", () => {
    expect(
      sourceItemEngagementScore(
        sourceItem({
          score: 100,
          comments: 20,
          upvoteRatio: 0.9,
        }),
      ),
    ).toBeGreaterThan(170);
    expect(
      sourceItemEngagementScore(
        sourceItem({
          likes: 100,
          retweets: 10,
          replies: 5,
          quotes: 2,
          trendScore: 50,
        }),
      ),
    ).toBeGreaterThan(180);
  });

  it("counts quoted phrases as relevance evidence", () => {
    const item = sourceItem({
      title: "OpenAI Codex local workflow",
      body: "Developers compare coding agent loops.",
    });

    expect(sourceItemRelevanceScore(item, ['"OpenAI Codex"'])).toBeGreaterThan(
      sourceItemRelevanceScore(item, ["unrelated launch"]),
    );
  });

  it("returns ranking breakdowns with authority, capped engagement and freshness reasons", () => {
    const plan = createSourceItemRankingPlan({
      queries: ['from:OpenAI "Codex CLI"'],
      generatedAt: new Date("2026-07-04T12:00:00.000Z"),
    });
    const breakdown = sourceItemRankingBreakdown(
      sourceItem({
        title: "Codex CLI release notes",
        body: "The official post covers MCP support.",
        authorHandle: "openai",
        score: 800,
        comments: 50,
      }),
      plan,
    );

    expect(breakdown.totalScore).toBeGreaterThan(900);
    expect(breakdown.authorityScore).toBe(0.35);
    expect(breakdown.engagementCapped).toBeLessThanOrEqual(6);
    expect(breakdown.reasonCodes).toEqual(
      expect.arrayContaining([
        "query_token_match",
        "exact_phrase_match",
        "trusted_handle_match",
        "strong_engagement_signal",
        "fresh_source_item",
      ]),
    );
  });

  it("matches CamelCase products and handles without requiring exact casing", () => {
    const item = sourceItem({
      title: "Claude Code MCP outage notes from OpenAI",
      body: "The thread covers agent retries.",
    });

    expect(
      sourceItemRelevanceScore(item, ["ClaudeCode @OpenAI"]),
    ).toBeGreaterThan(0.5);
  });

  it("does not let a generic AI token outrank specific singular and plural matches", () => {
    const plan = createSourceItemRankingPlan({
      queries: ["AI coding agents production reliability"],
    });
    const viral = sourceItem({
      title: "Viral AI subscription debate",
      body: "Consumer pricing backlash.",
      score: 10_000,
      comments: 2_000,
    });
    const specific = sourceItem({
      title: "Coding agent production reliability checklist",
      body: "Teams compare retries and monitoring.",
      score: 3,
      comments: 1,
    });

    expect(rankSourceItems([viral, specific], plan)[0]).toBe(specific);
  });

  it("ignores negative and non-finite engagement metrics", () => {
    expect(
      sourceItemEngagementScore({
        title: "Bad metrics",
        body: "",
        publishedAt: new Date("2026-07-04T00:00:00.000Z"),
        metadata: {
          score: -100,
          likes: Number.NaN,
          replies: Number.POSITIVE_INFINITY,
        },
      }),
    ).toBe(0);
  });

  it("uses the strongest valid metric alias when metadata shapes overlap", () => {
    expect(
      sourceItemEngagementScore({
        title: "Mixed metric aliases",
        body: "",
        publishedAt: new Date("2026-07-04T00:00:00.000Z"),
        metadata: {
          likes: 0,
          publicMetrics: { like_count: 100 },
          metrics: { likes: 50 },
        },
      }),
    ).toBe(100);
  });
});

const sourceItem = (params: {
  readonly title?: string;
  readonly body?: string;
  readonly authorHandle?: string;
  readonly score?: number;
  readonly comments?: number;
  readonly upvoteRatio?: number;
  readonly likes?: number;
  readonly retweets?: number;
  readonly replies?: number;
  readonly quotes?: number;
  readonly trendScore?: number;
}) => ({
  title: params.title ?? "Source item",
  body: params.body ?? "",
  authorHandle: params.authorHandle,
  publishedAt: new Date("2026-07-04T00:00:00.000Z"),
  metadata: {
    score: params.score,
    numComments: params.comments,
    upvoteRatio: params.upvoteRatio,
    likes: params.likes,
    retweets: params.retweets,
    replies: params.replies,
    quotes: params.quotes,
    trendScore: params.trendScore,
  },
});
