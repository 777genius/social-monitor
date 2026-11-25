import type { ReaderSummaryCitation } from "../../domain";
import { admitCitedStoryClusterId } from "./openai-responses-reader-summary-story-cluster-admission";

const citation = (id: string, feedItemId: string): ReaderSummaryCitation => ({
  citationId: id,
  feedItemId,
  sourceItemId: feedItemId,
  providerKey: "synthetic-provider",
  field: "title",
  canonicalUrl: "https://example.test/source",
});

describe("OpenAI reader story cluster admission", () => {
  const known = new Set(["cluster-a", "cluster-b"]);
  const citations = new Map([
    ["c1", citation("c1", "feed-a")],
    ["c2", citation("c2", "feed-a-duplicate")],
    ["c3", citation("c3", "feed-b")],
  ]);
  const byFeed = new Map([
    ["feed-a", "cluster-a"],
    ["feed-a-duplicate", "cluster-a"],
    ["feed-b", "cluster-b"],
  ]);
  const admit = (declared: string, cited: readonly string[]) =>
    admitCitedStoryClusterId({ storyClusterId: declared }, cited, known, citations, byFeed);

  it("admits known identity or repairs unknown identity from a unique cited cluster", () => {
    expect(admit("cluster-a", ["c1", "c2"])).toBe("cluster-a");
    expect(admit("invented-cluster", ["c2"])).toBe("cluster-a");
    // Original policy also accepts a known declaration when no cluster is cited.
    expect(admit("cluster-a", ["unmapped-citation"])).toBe("cluster-a");
  });

  it("rejects conflicting, cross-cluster and unresolved claims", () => {
    expect(admit("cluster-b", ["c1"])).toBeUndefined();
    expect(admit("cluster-a", ["c1", "c3"])).toBeUndefined();
    expect(admit("invented-cluster", ["unmapped-citation"])).toBeUndefined();
    expect(admit("", [])).toBeUndefined();
  });

  it("preserves repeated same-cluster evidence and never mutates input data", () => {
    const before = JSON.stringify([...citations.entries()]);
    expect(admit("", ["c1", "c1", "c2"])).toBe("cluster-a");
    expect(JSON.stringify([...citations.entries()])).toBe(before);
    expect([...known]).toEqual(["cluster-a", "cluster-b"]);
    expect([...byFeed.entries()]).toHaveLength(3);
  });
});
