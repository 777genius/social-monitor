import type {
  ReaderSummaryTopicMap,
  ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import { evaluateReaderSummaryTopicMapStructure } from "./reader-summary-topic-map-structure-quality";

describe("reader summary topic map structure quality", () => {
  it("accepts a compact map with supported groups and neutral singletons", () => {
    const topicMap = map([
      node("gpt-api", "OpenAI GPT API", "group:openai-models"),
      node("codex", "OpenAI Codex", "group:openai-models"),
      node("claude-code", "Claude Code", "group:claude-products"),
      node("claude-limits", "Claude Limits", "group:claude-products"),
      node("postgres", "Postgres", "group:ungrouped"),
    ]);
    topicMap.groups = [
      group("group:openai-models", "OpenAI Models", [
        "topic:gpt-api",
        "topic:codex",
      ]),
      group("group:claude-products", "Claude Products", [
        "topic:claude-code",
        "topic:claude-limits",
      ]),
      group("group:ungrouped", "Ungrouped", ["topic:postgres"]),
    ];
    topicMap.edges = [
      edge("gpt-api", "codex"),
      edge("claude-code", "claude-limits"),
    ];

    expect(evaluateReaderSummaryTopicMapStructure(topicMap)).toMatchObject({
      passed: true,
      issues: [],
      metrics: {
        semanticGroupCount: 2,
        ungroupedNodeCount: 1,
        groupedCoverage: 0.8,
        incoherentGroupNodeCount: 0,
        invalidEdgeCount: 0,
      },
    });
  });

  it("rejects singleton groups, misleading labels and neutral edges", () => {
    const topicMap = map([
      node("grok", "Grok", "topic:claude-code"),
      node("chatgpt", "Shared Topic", "group:chatgpt-work"),
      node("openai", "Shared Topic", "group:openai-models"),
      node("neutral", "Neutral Topic", "group:ungrouped"),
    ]);
    topicMap.groups = [
      group("topic:claude-code", "Grok Serious Run", ["topic:grok"]),
      group("group:chatgpt-work", "Introducing Way Reflect", ["topic:chatgpt"]),
      group("group:openai-models", "OpenAI Models", ["topic:openai"]),
      group("group:ungrouped", "Ungrouped", ["topic:neutral"]),
    ];
    topicMap.edges = [edge("neutral", "chatgpt")];

    const quality = evaluateReaderSummaryTopicMapStructure(topicMap);

    expect(quality.passed).toBe(false);
    expect(quality.metrics).toMatchObject({
      singletonSemanticGroupCount: 3,
      invalidGroupIdCount: 1,
      misalignedGroupLabelCount: 2,
      incoherentGroupNodeCount: 3,
      invalidEdgeCount: 1,
      duplicateLabelAcrossGroupsCount: 1,
    });
  });

  it("accepts low grouping coverage when the supported group is coherent", () => {
    const topicMap = map([
      node("gpt-api", "OpenAI GPT API", "group:openai-models"),
      node("gpt-codex", "OpenAI Codex", "group:openai-models"),
      node("postgres", "Postgres Scaling", "group:ungrouped"),
      node("rust", "Rust Compiler", "group:ungrouped"),
      node("security", "Supply Chain Security", "group:ungrouped"),
    ]);
    topicMap.groups = [
      group("group:openai-models", "OpenAI Models", [
        "topic:gpt-api",
        "topic:gpt-codex",
      ]),
      group("group:ungrouped", "Ungrouped", [
        "topic:postgres",
        "topic:rust",
        "topic:security",
      ]),
    ];
    topicMap.edges = [edge("gpt-api", "gpt-codex")];

    const quality = evaluateReaderSummaryTopicMapStructure(topicMap);

    expect(quality.passed).toBe(true);
    expect(quality.metrics.groupedCoverage).toBe(0.4);
  });
});

const map = (nodes: ReaderSummaryTopicMapNode[]): MutableTopicMap => ({
  schemaVersion: "reader_summary.topic_map.v1",
  generatedBy: "agent-runtime",
  confidence: { level: "medium", score: 0.7, rationale: "Fixture" },
  nodes,
  groups: [],
  edges: [],
  warnings: [],
});

type MutableTopicMap = Omit<ReaderSummaryTopicMap, "groups" | "edges"> & {
  groups: ReaderSummaryTopicMap["groups"];
  edges: ReaderSummaryTopicMap["edges"];
};

const node = (
  id: string,
  label: string,
  groupId: string,
): ReaderSummaryTopicMapNode => ({
  id: `topic:${id}`,
  label,
  groupId,
  storyClusterIds: [`story:${id}`],
  popularityScore: 50,
  sizeWeight: 0.7,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  citationIds: [`citation:${id}`],
  keywords: [label],
  rationale: "Fixture",
});

const group = (
  id: string,
  label: string,
  nodeIds: readonly string[],
): ReaderSummaryTopicMap["groups"][number] => ({
  id,
  label,
  colorKey: "blue",
  nodeIds,
  confidence: { level: "medium", score: 0.7, rationale: "Fixture" },
});

const edge = (
  source: string,
  target: string,
): ReaderSummaryTopicMap["edges"][number] => ({
  sourceNodeId: `topic:${source}`,
  targetNodeId: `topic:${target}`,
  weight: 0.8,
  reason: "Fixture",
});
