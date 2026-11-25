import { normalizeTopStory } from "./openai-responses-reader-summary-story-input";

describe("reader summary story input normalization", () => {
  it("preserves immutable authored provenance before citation and cluster reconciliation", () => {
    const story = normalizeTopStory({
      storyClusterId: "story-synthetic",
      title: "Synthetic story",
      summary: "One synthetic evidence claim",
      citationIds: ["c1", "c2"],
      interestIds: ["i1"],
      providerKeys: ["rss"],
      readerReasonProvenance: { kind: "untrusted-model-field" },
    });
    expect(story.readerReasonProvenance).toEqual({
      kind: "model",
      originalStoryClusterId: "story-synthetic",
      originalCitationIds: ["c1", "c2"],
      originalSummary: "One synthetic evidence claim",
    });
  });

  it("falls back safely when a model omits the summary", () => {
    const story = normalizeTopStory({
      storyClusterId: "story-synthetic",
      citationIds: "c1,c2",
      providerKeys: "rss,github",
    });
    expect(story.readerReasonProvenance).toEqual({ kind: "normalizer_fallback" });
    expect(story.citationIds).toEqual(["c1", "c2"]);
    expect(story.providerKeys).toEqual(["rss", "github"]);
  });
});
