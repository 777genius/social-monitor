import {
  formatFeedProviderMetrics,
  summarizeFeedProviderMetrics,
} from "./feed-provider-metric-labels";
import {
  feedProviderMetricStrength,
  feedProviderMetricsFromMetadata,
} from "./feed-provider-metrics";

describe("feedProviderMetricsFromMetadata", () => {
  it("maps Reddit raw score, comments and ratio without dropping negative scores", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "reddit",
      providerMetadata: {
        subreddit: "TinySaaS",
        score: -3,
        numComments: 2,
        upvoteRatio: 0.41,
      },
    });

    expect(metrics).toEqual({
      kind: "reddit_post",
      providerKey: "reddit",
      sourceKey: "r/tinysaas",
      contentType: "post",
      score: -3,
      comments: 2,
      upvoteRatio: 0.41,
    });
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBeGreaterThan(0);
    expect(formatFeedProviderMetrics(metrics)).toEqual([
      { label: "Score", value: "-3" },
      { label: "Comments", value: "2" },
      { label: "Upvote ratio", value: "41%" },
    ]);
    expect(summarizeFeedProviderMetrics(metrics)).toBe(
      "-3 score, 2 comments, 41% upvoted",
    );
  });

  it("keeps Reddit ranking strength non-negative for zero engagement and low ratio", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "reddit",
      providerMetadata: {
        subreddit: "TinySaaS",
        score: 0,
        numComments: 0,
        upvoteRatio: 0,
      },
    });

    expect(metrics).toEqual(
      expect.objectContaining({
        kind: "reddit_post",
        score: 0,
        comments: 0,
        upvoteRatio: 0,
      }),
    );
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBe(0);
  });

  it("maps GitHub repository totals and all available trend deltas", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          topics: ["ai", "agents", "developer-tools"],
          language: "TypeScript",
          forksCount: 6100,
        },
        trend: {
          totalStars: 54000,
          stars24h: 210,
          stars48h: 360,
          stars7d: 1200,
          stars30d: 4800,
          stars90d: 11000,
          primaryWindow: "24h",
          checkedAt: "2026-06-23T12:00:00.000Z",
          source: "gh_archive_bigquery_plus_github_live",
        },
      },
    });

    expect(metrics).toEqual({
      kind: "github_repository",
      providerKey: "github-repo-radar",
      sourceKey:
        "repo-trending:24h:query:any:language:typescript:topic:agents+ai",
      contentType: "repository",
      evidenceSource: "gh_archive_watch_event",
      evidenceLabel: "GH Archive WatchEvent - hourly updated",
      stars: 54000,
      forks: 6100,
      checkedAt: "2026-06-23T12:00:00.000Z",
      source: "gh_archive_bigquery_plus_github_live",
      trendingDelta: {
        window: "24h",
        value: 210,
      },
      trendDeltas: [
        {
          window: "24h",
          value: 210,
        },
        {
          window: "48h",
          value: 360,
        },
        {
          window: "7d",
          value: 1200,
        },
        {
          window: "30d",
          value: 4800,
        },
        {
          window: "90d",
          value: 11000,
        },
      ],
    });
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBeGreaterThan(0);
    expect(formatFeedProviderMetrics(metrics)).toEqual([
      { label: "Evidence", value: "GH Archive WatchEvent - hourly updated" },
      { label: "Checked", value: "2026-06-23T12:00:00.000Z" },
      { label: "Source lag", value: "GH Archive can lag by about an hour" },
      { label: "Stars", value: "54,000" },
      { label: "Trend 24h", value: "+210 / 24h" },
      { label: "Trend 48h", value: "+360 / 48h" },
      { label: "Trend 7d", value: "+1200 / 7d" },
      { label: "Trend 30d", value: "+4800 / 30d" },
      { label: "Trend 90d", value: "+11000 / 90d" },
      { label: "Forks", value: "6,100" },
    ]);
    expect(summarizeFeedProviderMetrics(metrics)).toBe(
      "+210 stars / 24h, 54,000 total stars",
    );
  });

  it("weights GitHub Repo Radar recent star deltas before historical totals", () => {
    const recentBreakout = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: { language: "TypeScript", forksCount: 10 },
        trend: {
          totalStars: 2000,
          stars24h: 300,
          stars48h: 420,
          primaryWindow: "24h",
        },
      },
    });
    const oldLargeRepo = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: { language: "TypeScript", forksCount: 10 },
        trend: {
          totalStars: 100000,
          stars24h: 5,
          stars48h: 12,
          primaryWindow: "24h",
        },
      },
    });

    expect(feedProviderMetricStrength(recentBreakout!)).toBeGreaterThan(
      feedProviderMetricStrength(oldLargeRepo!),
    );
  });

  it("keeps GitHub repository cohorts separate by normalized topic bucket", () => {
    const aiMetrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["AI Agents", "developer-tools"],
          forksCount: 10,
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });
    const frontendMetrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["frontend", "design-system"],
          forksCount: 10,
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });

    expect(aiMetrics).toEqual(
      expect.objectContaining({
        sourceKey:
          "repo-trending:24h:query:any:language:typescript:topic:ai-agents+developer-tools",
      }),
    );
    expect(frontendMetrics).toEqual(
      expect.objectContaining({
        sourceKey:
          "repo-trending:24h:query:any:language:typescript:topic:design-system+frontend",
      }),
    );
  });

  it("uses GitHub Repo Radar source cohort before repository tags", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["random-repo-tag", "developer-tools"],
          forksCount: 10,
        },
        sourceCohort: {
          topics: ["Agents", "AI"],
          languages: ["TypeScript", "Rust"],
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });

    expect(metrics).toEqual(
      expect.objectContaining({
        sourceKey:
          "repo-trending:24h:query:any:language:rust+typescript:topic:agents+ai",
      }),
    );
  });

  it("fingerprints GitHub Repo Radar source queries without exposing raw query text", () => {
    const rawQuery = "secret customer repo:acme/private-roadmap";
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["agents"],
          forksCount: 10,
        },
        sourceCohort: {
          query: rawQuery,
          topics: ["Agents"],
          languages: ["TypeScript"],
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });
    const sameQueryMetrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["agents"],
          forksCount: 10,
        },
        sourceCohort: {
          query: rawQuery,
          topics: ["Agents"],
          languages: ["TypeScript"],
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });
    const differentQueryMetrics = feedProviderMetricsFromMetadata({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: {
          language: "TypeScript",
          topics: ["agents"],
          forksCount: 10,
        },
        sourceCohort: {
          query: "public agents",
          topics: ["Agents"],
          languages: ["TypeScript"],
        },
        trend: {
          totalStars: 1000,
          stars24h: 20,
          primaryWindow: "24h",
        },
      },
    });

    expect(metrics?.sourceKey).toMatch(
      /^repo-trending:24h:query:q_[a-z0-9]+:language:typescript:topic:agents$/,
    );
    expect(metrics?.sourceKey).not.toContain("secret");
    expect(metrics?.sourceKey).not.toContain("private-roadmap");
    expect(metrics?.sourceKey).toBe(sameQueryMetrics?.sourceKey);
    expect(metrics?.sourceKey).not.toBe(differentQueryMetrics?.sourceKey);
  });

  it("maps GitHub Trending page rank and stars-gained metrics separately from Repo Radar", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-trending-page",
      providerMetadata: {
        kind: "github_trending_page_repository",
        repository: {
          fullName: "calesthio/OpenMontage",
          language: "Python",
          totalStars: 18398,
          forksCount: 2113,
        },
        trending: {
          rank: 1,
          starsGained: 3703,
          window: "daily",
          capturedAt: "2026-07-12T09:00:00.000Z",
          scope: {
            programmingLanguage: "Python",
            spokenLanguage: "en",
          },
          appearances: [
            {
              rank: 1,
              starsGained: 3703,
              window: "daily",
              capturedAt: "2026-07-12T09:00:00.000Z",
              scope: {
                programmingLanguage: "Python",
                spokenLanguage: "en",
              },
            },
          ],
        },
      },
    });

    expect(metrics).toEqual({
      kind: "github_trending_repository",
      providerKey: "github-trending-page",
      sourceKey:
        "github-trending-page:daily:language:python:spoken-language:en",
      contentType: "repository",
      stars: 18398,
      forks: 2113,
      rank: 1,
      starsGained: 3703,
      window: "daily",
      capturedAt: "2026-07-12T09:00:00.000Z",
      scope: {
        programmingLanguage: "Python",
        spokenLanguage: "en",
      },
      appearances: [
        {
          rank: 1,
          starsGained: 3703,
          window: "daily",
          capturedAt: "2026-07-12T09:00:00.000Z",
          scope: {
            programmingLanguage: "Python",
            spokenLanguage: "en",
          },
        },
      ],
    });
    expect(formatFeedProviderMetrics(metrics)).toEqual([
      { label: "GitHub Trending today", value: "#1, +3,703 stars today" },
      { label: "Trending scope", value: "Python / spoken en" },
      { label: "Captured", value: "2026-07-12T09:00:00.000Z" },
      { label: "Stars", value: "18,398" },
      { label: "Forks", value: "2,113" },
    ]);
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBeGreaterThan(0);
  });

  it("keeps legacy GitHub Trending metadata usable without explicit scope", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-trending-page",
      providerMetadata: {
        kind: "github_trending_page_repository",
        repository: {
          language: "Rust",
          totalStars: 900,
          forksCount: 40,
        },
        trending: {
          rank: 3,
          starsGained: 80,
          window: "weekly",
        },
      },
    });

    expect(metrics).toMatchObject({
      sourceKey: "github-trending-page:weekly:language:rust",
      scope: { programmingLanguage: "Rust" },
      appearances: [
        {
          rank: 3,
          starsGained: 80,
          window: "weekly",
          scope: { programmingLanguage: "Rust" },
        },
      ],
    });
  });

  it("does not reinterpret an explicit overall scope as repository language", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "github-trending-page",
      providerMetadata: {
        kind: "github_trending_page_repository",
        repository: {
          language: "Rust",
          totalStars: 900,
          forksCount: 40,
        },
        trending: {
          rank: 1,
          starsGained: 80,
          window: "daily",
          scope: {},
        },
      },
    });

    expect(metrics).toMatchObject({
      sourceKey: "github-trending-page:daily:language:any",
      scope: {},
    });
  });

  it("maps Hacker News story points and comments", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "hacker-news",
      providerMetadata: {
        kind: "hacker_news_story",
        source: "firebase",
        points: 64,
        comments: 18,
      },
    });

    expect(metrics).toEqual({
      kind: "hacker_news_story",
      providerKey: "hacker-news",
      sourceKey: "hn:firebase",
      contentType: "story",
      points: 64,
      comments: 18,
    });
  });

  it("maps Hacker News comment score, replies and depth", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "hacker-news",
      providerMetadata: {
        kind: "hacker_news_comment",
        source: "comment_search",
        score: 17,
        replies: 2,
        depth: 1,
        rank: 4,
        role: "reply",
      },
    });

    expect(metrics).toEqual({
      kind: "hacker_news_comment",
      providerKey: "hacker-news",
      sourceKey: "hn:comment_search",
      contentType: "comment",
      score: 17,
      replies: 2,
      depth: 1,
      rank: 4,
      role: "reply",
      scoreConfidence: "provider_reported",
    });
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBeGreaterThan(0);
  });

  it("maps Hacker News comment display rank when score is unavailable", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "hacker-news",
      providerMetadata: {
        kind: "hacker_news_comment",
        source: "top",
        replies: 1,
        depth: 0,
        rank: 1,
        role: "top_level_comment",
      },
    });

    expect(metrics).toEqual({
      kind: "hacker_news_comment",
      providerKey: "hacker-news",
      sourceKey: "hn:top",
      contentType: "comment",
      score: 0,
      replies: 1,
      depth: 0,
      rank: 1,
      role: "top_level_comment",
      scoreConfidence: "not_available",
    });
    expect(
      metrics === undefined ? undefined : feedProviderMetricStrength(metrics),
    ).toBeGreaterThan(0);
  });

  it("maps X API v2 public_metrics into public engagement counters", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "x-twitter",
      providerMetadata: {
        kind: "x_post",
        accountHandle: "OpenAI",
        public_metrics: {
          like_count: 1200,
          retweet_count: 340,
          reply_count: 75,
          quote_count: 42,
          bookmark_count: 88,
          impression_count: 90000,
        },
      },
    });

    expect(metrics).toEqual({
      kind: "x_post",
      providerKey: "x-twitter",
      sourceKey: "account:openai",
      contentType: "post",
      likes: 1200,
      reposts: 340,
      replies: 75,
      quotes: 42,
      bookmarks: 88,
      impressions: 90000,
    });
  });

  it("weights X reposts and replies as engagement instead of raw likes only", () => {
    const reposted = feedProviderMetricsFromMetadata({
      providerKey: "x-twitter",
      providerMetadata: {
        kind: "x_post",
        public_metrics: {
          like_count: 50,
          retweet_count: 80,
          reply_count: 40,
        },
      },
    });
    const likedOnly = feedProviderMetricsFromMetadata({
      providerKey: "x-twitter",
      providerMetadata: {
        kind: "x_post",
        public_metrics: {
          like_count: 120,
          retweet_count: 0,
          reply_count: 0,
        },
      },
    });

    expect(feedProviderMetricStrength(reposted!)).toBeGreaterThan(
      feedProviderMetricStrength(likedOnly!),
    );
  });

  it("fingerprints X search source queries without exposing raw query text", () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: "x-twitter",
      providerMetadata: {
        kind: "x_post",
        searchQuery: "secret launch customer",
        public_metrics: {
          like_count: 10,
        },
      },
    });

    expect(metrics?.sourceKey).toMatch(/^search:q_[a-z0-9]+$/);
    expect(metrics?.sourceKey).not.toContain("secret");
    expect(metrics?.sourceKey).not.toContain("customer");
  });

  it("does not fabricate metrics for unsupported or empty provider payloads", () => {
    expect(
      feedProviderMetricsFromMetadata({
        providerKey: "rss",
        providerMetadata: {
          score: 10,
        },
      }),
    ).toBeUndefined();
    expect(
      feedProviderMetricsFromMetadata({
        providerKey: "x-twitter",
        providerMetadata: {
          kind: "x_post",
        },
      }),
    ).toBeUndefined();
  });
});
