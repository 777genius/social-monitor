import { readerBrowseSourceEngagement, readerBrowseSourceLikeCount } from "./reader-browse-source-engagement";
import type { JsonObject } from "@social-monitor/shared-kernel";

describe("browse source engagement", () => {
  it("reads raw X likes without requiring or weighting reposts and preserves zero", () => {
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
      providerMetadata: { kind: "x_post", likes: 10, retweets: 999 } })).toBe(10);
    expect(readerBrowseSourceLikeCount({ providerKey: "twitter",
      providerMetadata: { kind: "twitter_post", public_metrics: { like_count: 0 } } })).toBe(0);
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
      providerMetadata: { kind: "x_post", likes: 12 } })).toBe(12);
    expect(readerBrowseSourceLikeCount({ providerKey: "reddit",
      providerMetadata: { kind: "reddit_post", score: 10 } })).toBeUndefined();
  });
  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "100"])(
    "keeps missing or malformed X likes unknown: %s", (likes) => {
      expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
        providerMetadata: { kind: "x_post", retweets: 999,
          ...(likes === undefined ? {} : { likes }) } })).toBeNull();
    });
  it("rejects conflicting native like aliases", () => {
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
      providerMetadata: { kind: "x_post", likes: 10, public_metrics: { like_count: 20 } } })).toBeNull();
  });
  it.each<JsonObject>([
    { retweets: "malformed", replies: -1, views: 1.5 },
    { retweets: 1, reposts: 2, publicMetrics: { retweet_count: 3 } },
    { replies: 1, public_metrics: { reply_count: 2 }, impressions: Number.MAX_SAFE_INTEGER + 1 },
  ])("keeps genuine likes when unrelated native metrics are invalid or conflict: %j", (otherMetrics) => {
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
      providerMetadata: { kind: "x_post", ...otherMetrics, likes: 10 } })).toBe(10);
  });
  it.each<JsonObject>([
    { likes: 10 }, { publicMetrics: { like_count: 10 } }, { public_metrics: { like_count: 10 } },
    { publicMetrics: { likeCount: 10 } }, { metrics: { likes: 10 } },
  ])("preserves every documented native like alias: %j", (aliases) => {
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter",
      providerMetadata: { kind: "x_post", ...aliases } })).toBe(10);
  });
  it("does not mutate Model engagement metadata while isolating raw likes", () => {
    const providerMetadata = Object.freeze({ kind: "x_post", likes: 10, retweets: 100,
      publicMetrics: Object.freeze({ like_count: 10, retweet_count: 100 }) });
    expect(readerBrowseSourceLikeCount({ providerKey: "x-twitter", providerMetadata })).toBe(10);
    expect(readerBrowseSourceEngagement({ providerKey: "x-twitter", providerMetadata,
      engagementObservedAt: null })).toBe(210);
  });
  it("keeps missing scores unknown while preserving a recorded zero", () => {
    const params = { providerKey: "reddit", engagementObservedAt: null,
      providerMetadata: { kind: "reddit_post", numComments: 2 } };
    expect(readerBrowseSourceEngagement(params)).toBeNull();
    expect(readerBrowseSourceEngagement({ ...params, providerMetadata: { ...params.providerMetadata, score: 0 } })).toBe(0);
  });

  it("does not invent zero Hacker News points from a comment count", () => {
    expect(readerBrowseSourceEngagement({ providerKey: "hacker-news", engagementObservedAt: null,
      providerMetadata: { kind: "hacker_news_story", comments: 2 } })).toBeNull();
  });

  it("requires both GitHub deltas and uses the same max(stars, forks/2) count", () => {
    const params = { providerKey: "github-repo-radar", engagementObservedAt: null,
      providerMetadata: { kind: "github_repository_trend", repository: { forksCount: 20 },
        trend: { primaryWindow: "48h", stars48h: 4 } } };
    expect(readerBrowseSourceEngagement(params)).toBeNull();
    expect(readerBrowseSourceEngagement({ ...params, providerMetadata: { ...params.providerMetadata,
      trend: { ...params.providerMetadata.trend, forks48h: 20 } } })).toBe(10);
  });
});
