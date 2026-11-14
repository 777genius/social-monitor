import {
  citationIdForDeterministicReaderEvidence,
  indexDeterministicReaderSummaryCitations,
} from "./deterministic-reader-summary-citation-index";

const citation = (feedItemId: string, citationId: string) => ({
  feedItemId,
  citationId,
  sourceItemId: `source-${feedItemId}`,
  providerKey: "fixture-source",
  field: "title" as const,
  canonicalUrl: `https://example.test/${feedItemId}`,
});

describe("deterministic reader citation identity index", () => {
  it("preserves first-occurrence binding with duplicate feed item IDs", () => {
    const citations = [
      citation("feed-a", "c7"),
      citation("feed-b", "c3"),
      citation("feed-a", "c2"),
    ];
    const index = indexDeterministicReaderSummaryCitations(citations);
    expect(citationIdForDeterministicReaderEvidence(index, "feed-a")).toBe("c7");
    expect(citationIdForDeterministicReaderEvidence(index, "feed-b")).toBe("c3");
    expect(index.size).toBe(2);
    expect(citations).toEqual([
      citation("feed-a", "c7"),
      citation("feed-b", "c3"),
      citation("feed-a", "c2"),
    ]);
  });

  it("retains c1 as the exact legacy fallback for unknown or empty citations", () => {
    const index = indexDeterministicReaderSummaryCitations([
      citation("feed-a", "c9"),
    ]);
    expect(citationIdForDeterministicReaderEvidence(index, "missing")).toBe("c1");
    expect(citationIdForDeterministicReaderEvidence(new Map(), "feed-a")).toBe("c1");
  });
});
