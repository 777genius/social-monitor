import {
  independentEvidenceItems,
  independentEvidenceProviderKeys,
} from "./reader-summary-provider-identity";
import type { SummaryEvidenceItem } from "./summary-evidence-item";

describe("reader summary source lineage", () => {
  it("does not count an HN discussion and its RSS publication as independent support", () => {
    expect(
      independentEvidenceProviderKeys([
        evidence({
          feedItemId: "hn-ant",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=123",
          sourceOriginUrl: "https://ant.example/",
          score: 2.02,
        }),
        evidence({
          feedItemId: "rss-ant",
          providerKey: "rss",
          canonicalUrl: "https://ant.example/",
          score: 1.7,
        }),
      ]),
    ).toEqual(["hacker-news"]);
  });

  it("keeps genuinely different provider publications independent", () => {
    expect(
      independentEvidenceProviderKeys([
        evidence({
          feedItemId: "hn-story",
          providerKey: "hacker-news",
          canonicalUrl: "https://news.ycombinator.com/item?id=456",
          sourceOriginUrl: "https://launch.example/",
        }),
        evidence({
          feedItemId: "reddit-analysis",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.com/r/programming/comments/analysis",
        }),
      ]),
    ).toEqual(["hacker-news", "reddit"]);
  });

  it("keeps separate publications from one provider as independent evidence", () => {
    const items = [
      evidence({
        feedItemId: "reddit-first",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/ai/comments/first",
      }),
      evidence({
        feedItemId: "reddit-second",
        providerKey: "reddit",
        canonicalUrl: "https://reddit.com/r/ai/comments/second",
      }),
    ];

    expect(independentEvidenceItems(items)).toHaveLength(2);
    expect(independentEvidenceProviderKeys(items)).toEqual(["reddit"]);
  });
});

const evidence = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed",
  sourceItemId: "source",
  sourceBindingId: "binding",
  interestId: "ai",
  providerKey: "rss",
  canonicalUrl: "https://example.test/story",
  title: "Relevant AI tooling story",
  publishedAt: new Date("2026-07-11T10:00:00.000Z"),
  observedAt: new Date("2026-07-11T10:05:00.000Z"),
  score: 1.8,
  whyImportant: ["Relevant to monitored AI tooling"],
  ...overrides,
});
