import type { ReaderSummaryTopicMapNode } from "../entities/reader-summary-topic-map";
import { mergeReaderSummaryTopicMapNodesByLabel } from "./reader-summary-topic-map-aggregation";

describe("mergeReaderSummaryTopicMapNodesByLabel", () => {
  it("merges identical reader-facing labels across conflicting groups", () => {
    const nodes = mergeReaderSummaryTopicMapNodesByLabel([
      node("first", "ChatGPT Work", "group:chatgpt-work", 2, 0.9),
      node("second", "chatgpt work", "group:openai-models", 1, 0.6),
    ]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "topic:aggregate:label:chatgpt-work",
      label: "ChatGPT Work",
      groupId: "group:chatgpt-work",
      storyClusterIds: ["story:first", "story:second"],
      evidenceCount: 3,
      providerKeys: ["rss", "reddit"],
    });
  });
});

const node = (
  id: string,
  label: string,
  groupId: string,
  evidenceCount: number,
  popularityScore: number,
): ReaderSummaryTopicMapNode => ({
  id: `topic:${id}`,
  label,
  groupId,
  storyClusterIds: [`story:${id}`],
  popularityScore,
  sizeWeight: 0.7,
  evidenceCount,
  providerKeys: [id === "first" ? "rss" : "reddit"],
  interestIds: ["ai"],
  citationIds: [`citation:${id}`],
  keywords: [label],
  rationale: "Fixture",
});
