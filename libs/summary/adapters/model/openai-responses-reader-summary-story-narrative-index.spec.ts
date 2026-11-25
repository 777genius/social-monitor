import { buildReaderSummaryStoryNarrativeIndex } from "./openai-responses-reader-summary-story-narrative-index";

describe("reader summary narrative story index", () => {
  it("projects ordered citation and cluster fallbacks without losing story identity", () => {
    const index = buildReaderSummaryStoryNarrativeIndex([
      { storyClusterId: "cluster-a", title: "First title", summary: "First text", citationIds: ["cite-1", "cite-2"] },
      { storyClusterId: "cluster-b", title: "Second title", summary: "Second text", citationIds: ["cite-3"] },
    ]);
    expect([...index.storyTitlesByClusterId]).toEqual([
      ["cluster-a", "First title"], ["cluster-b", "Second title"],
    ]);
    expect(index.storySummariesByCitationId.get("cite-2")).toBe("First text");
    expect(index.storySummariesByClusterId.get("cluster-b")).toBe("Second text");
  });

  it("keeps the last value for duplicate ids, as the original Map projection did", () => {
    const index = buildReaderSummaryStoryNarrativeIndex([
      { storyClusterId: "cluster", title: "Old title", summary: "Old summary", citationIds: ["same"] },
      { storyClusterId: "cluster", title: "New title", summary: "New summary", citationIds: ["same"] },
    ]);
    expect(index.storyTitlesByClusterId.get("cluster")).toBe("New title");
    expect(index.storySummariesByClusterId.get("cluster")).toBe("New summary");
    expect(index.storySummariesByCitationId.get("same")).toBe("New summary");
    expect(index.storyTitlesByClusterId.size).toBe(1);
  });

  it("does not invent citations or cluster keys for an empty story slate", () => {
    const index = buildReaderSummaryStoryNarrativeIndex([]);
    expect(index.storyTitlesByClusterId.size).toBe(0);
    expect(index.storySummariesByCitationId.size).toBe(0);
  });
});
