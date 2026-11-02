import { readerBrowseSourceEngagement } from "./reader-browse-source-engagement";

describe("browse source engagement", () => {
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
