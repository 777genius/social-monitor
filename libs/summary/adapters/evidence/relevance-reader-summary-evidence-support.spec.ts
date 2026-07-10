import { providerNameForEvidence } from "./relevance-reader-summary-evidence-support";

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
});
