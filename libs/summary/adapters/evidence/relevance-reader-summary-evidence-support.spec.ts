import {
  providerMetricFacts,
  providerNameForEvidence,
} from "./relevance-reader-summary-evidence-support";

describe("relevance reader summary evidence support", () => {
  it("labels Hacker News canonical items received through RSS at the adapter boundary", () => {
    expect(
      providerNameForEvidence({
        providerKey: "rss",
        canonicalUrl: "https://news.ycombinator.com/item?id=48816039",
      }),
    ).toBe("Hacker News via RSS");
    expect(
      providerNameForEvidence({
        providerKey: "rss",
        canonicalUrl: "https://example.com/editorial-story",
      }),
    ).toBe("RSS");
  });

  it("preserves the captured GitHub Trending position and scope", () => {
    const facts = providerMetricFacts({
      providerKey: "github-trending-page",
      providerMetadata: {
        kind: "github_trending_page_repository",
        repository: { totalStars: 1200, forksCount: 90 },
        trending: {
          rank: 2,
          starsGained: 180,
          window: "daily",
          capturedAt: "2026-07-12T09:00:00.000Z",
          scope: {
            programmingLanguage: "TypeScript",
            spokenLanguage: "en",
          },
        },
      },
    });

    expect(facts.providerRanking).toEqual({
      kind: "github_trending",
      position: 2,
      starsGained: 180,
      window: "daily",
      capturedAt: "2026-07-12T09:00:00.000Z",
      scope: {
        programmingLanguage: "TypeScript",
        spokenLanguage: "en",
      },
    });
  });
});
