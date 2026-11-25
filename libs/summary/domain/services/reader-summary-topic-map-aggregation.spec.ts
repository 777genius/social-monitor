import type { ReaderSummaryTopicMapNode } from "../entities/reader-summary-topic-map";
import {
  mergeReaderSummaryTopicMapNodesByLabel,
  scopeReaderSummaryTopicMapNodeDrafts,
  type ReaderSummaryTopicMapNodeDraft,
} from "./reader-summary-topic-map-aggregation";

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

  it("scopes one reused topic id only when claim facets conflict", () => {
    const rollout = draft("rollout", "release");
    const mirror = draft("mirror");
    const benchmark = draft("benchmark", "benchmark");

    expect(
      scopeReaderSummaryTopicMapNodeDrafts([rollout, mirror]).map(
        (item) => item.aggregateKey,
      ),
    ).toEqual(["llm-topic:gpt-5-6", "llm-topic:gpt-5-6"]);

    const scoped = scopeReaderSummaryTopicMapNodeDrafts([
      rollout,
      mirror,
      benchmark,
    ]);
    expect(scoped.map((item) => item.aggregateKey)).toEqual([
      "llm-topic:gpt-5-6:claim:release",
      "llm-topic:gpt-5-6:claim:unspecified-topic-mirror",
      "llm-topic:gpt-5-6:claim:benchmark",
    ]);
  });
});

const draft = (
  id: string,
  primaryClaimFacet?: string,
): ReaderSummaryTopicMapNodeDraft => ({
  ...node(id, "GPT-5.6", "group:openai", 1, 0.5),
  aggregateKey: "llm-topic:gpt-5-6",
  aggregateRankScore: 0.5,
  primaryClaimFacet,
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
