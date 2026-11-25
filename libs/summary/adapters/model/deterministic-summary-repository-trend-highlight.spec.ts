import {
  formatRepositoryTrendHighlight as historicalTrendHighlight,
  formatSourceHighlight,
} from "./deterministic-summary-source-highlights";
import { formatRepositoryTrendHighlight } from "./deterministic-summary-repository-trend-highlight";

describe("deterministic summary GitHub trend metadata policy", () => {
  it("preserves historical export identity and composes immutable evidence labels", () => {
    expect(historicalTrendHighlight).toBe(formatRepositoryTrendHighlight);
    const metadata = Object.freeze({
      kind: "github_trending_page_repository",
      repository: Object.freeze({ fullName: "acme/agents", totalStars: 200 }),
      trending: Object.freeze({ starsGained: 12, window: "weekly", rank: 3 }),
    });
    const input: Parameters<typeof formatSourceHighlight>[0] = Object.freeze({
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      sourceBindingId: "binding-1",
      providerKey: "github",
      observedAt: new Date("2026-11-08T00:00:00.000Z"),
      title: "Original evidence",
      providerMetadata: metadata,
      relevance: Object.freeze({
        score: 1,
        rank: 1,
        clusterId: "cluster-1",
        clusterSize: 1,
        duplicateFeedItemIds: Object.freeze([]),
        whyImportant: Object.freeze(["Matches memory preference"]),
      }),
    });
    expect(formatRepositoryTrendHighlight(metadata))
      .toBe("acme/agents: #3 on GitHub Trending weekly, 200 stars, +12");
    expect(formatSourceHighlight(input))
      .toBe("acme/agents: #3 on GitHub Trending weekly, 200 stars, +12 (Matches memory preference)");
    expect(metadata.trending.starsGained).toBe(12);
  });

  it("keeps 48-hour precedence over 7-day growth and never mutates metadata", () => {
    const metadata = Object.freeze({
      kind: "github_repository_trend",
      repository: Object.freeze({ fullName: "acme/agents" }),
      trend: Object.freeze({ totalStars: 210, stars48h: 9, stars7d: 22 }),
    });
    expect(formatRepositoryTrendHighlight(metadata)).toBe("acme/agents: 210 stars, +9 in 48h");
    expect(formatRepositoryTrendHighlight(metadata)).toBe("acme/agents: 210 stars, +9 in 48h");
    expect(metadata.trend.stars7d).toBe(22);
  });

  it("preserves default daily window and fail-closed malformed provider metadata", () => {
    expect(formatRepositoryTrendHighlight({
      kind: "github_trending_page_repository",
      repository: { fullName: "acme/agents", totalStars: 210 },
      trending: { starsGained: 5, rank: 1 },
    })).toBe("acme/agents: #1 on GitHub Trending daily, 210 stars, +5");
    for (const metadata of [
      { kind: "github_repository_trend", repository: { fullName: "acme/agents" }, trend: { totalStars: Infinity, stars48h: 8 } },
      { kind: "github_repository_trend", repository: { fullName: " " }, trend: { totalStars: 10, stars7d: 5 } },
      { kind: "unrecognized_provider", repository: { fullName: "acme/agents" } },
      null,
      ["invalid"],
    ]) expect(formatRepositoryTrendHighlight(metadata)).toBeUndefined();
  });
});
