import type {
  ReaderSummaryTopicMapGroup,
  ReaderSummaryTopicMapNode,
} from "../entities/reader-summary-topic-map";
import { buildReaderSummaryTopicMapEdges } from "./reader-summary-topic-map-edge-policy";

describe("buildReaderSummaryTopicMapEdges", () => {
  it("connects concrete related topics without connecting every same-color node", () => {
    const nodes = [
      topicNode("sol", "GPT-5.6 Sol", ["openai", "gpt-5.6", "sol"]),
      topicNode("quotas", "Sol Ultra Quotas", ["openai", "sol", "quota"]),
      topicNode("work", "ChatGPT Work", ["openai", "chatgpt", "work"]),
      topicNode("week", "OpenAI Build Week", ["openai", "build-week"]),
    ];
    const edges = buildReaderSummaryTopicMapEdges(nodes, [topicGroup(nodes)]);

    expect(edges).toEqual([
      expect.objectContaining({
        sourceNodeId: "sol",
        targetNodeId: "quotas",
        reason: "Shared topic evidence: sol",
      }),
    ]);
  });

  it("removes dominant parent aliases and caps each node at two edges", () => {
    const groupId = "group:anthropic-ecosystem";
    const nodes = [
      topicNode(
        "a",
        "Claude Code Course",
        ["claude", "code", "course"],
        groupId,
      ),
      topicNode("b", "Claude Code Skill", ["claude", "code", "skill"], groupId),
      topicNode("c", "Claude Code Log", ["claude", "code", "log"], groupId),
      topicNode(
        "d",
        "Claude Code Adoption",
        ["claude", "code", "adoption"],
        groupId,
      ),
      topicNode(
        "e",
        "Anthropic Scientists",
        ["anthropic", "scientist"],
        groupId,
      ),
      topicNode("f", "Anthropic Usage Limits", ["anthropic", "usage"], groupId),
      topicNode("g", "Claude Scam", ["claude", "scam"], groupId),
      topicNode("h", "Claude Reflect", ["claude", "reflect"], groupId),
    ];
    const edges = buildReaderSummaryTopicMapEdges(nodes, [
      topicGroup(nodes, groupId, "Anthropic Ecosystem"),
    ]);
    const degrees = new Map<string, number>();
    for (const edge of edges) {
      degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) ?? 0) + 1);
      degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) ?? 0) + 1);
      expect(edge.reason).not.toContain("claude");
      expect(edge.reason).not.toContain("anthropic");
    }

    expect(edges).toHaveLength(3);
    expect(Math.max(...degrees.values())).toBeLessThanOrEqual(2);
  });

  it("does not create edges for unrelated or ungrouped topics", () => {
    const grouped = [
      topicNode("coding", "Coding Train", ["tutorial"]),
      topicNode("bills", "AI Bills", ["regulation"]),
    ];
    const ungrouped = [
      topicNode("grok", "Grok 4.5", ["grok-4.5"], "group:ungrouped"),
      topicNode(
        "markdown",
        "OpenKnowledge Markdown",
        ["markdown"],
        "group:ungrouped",
      ),
    ];

    expect(
      buildReaderSummaryTopicMapEdges(
        [...grouped, ...ungrouped],
        [
          topicGroup(grouped),
          topicGroup(ungrouped, "group:ungrouped", "Ungrouped"),
        ],
      ),
    ).toEqual([]);
  });

  it("does not create a relation from incidental evidence keywords", () => {
    const groupId = "group:anthropic-ecosystem";
    const nodes = [
      topicNode("limits", "Anthropic Limits", ["reddit", "url"], groupId),
      topicNode("spying", "Anthropic Spying", ["reddit", "url"], groupId),
    ];

    expect(
      buildReaderSummaryTopicMapEdges(nodes, [
        topicGroup(nodes, groupId, "Anthropic Ecosystem"),
      ]),
    ).toEqual([]);
  });
});

const topicNode = (
  id: string,
  label: string,
  keywords: readonly string[],
  groupId = "group:openai-ecosystem",
): ReaderSummaryTopicMapNode => ({
  id,
  label,
  groupId,
  storyClusterIds: [`story:${id}`],
  popularityScore: 50,
  sizeWeight: 1,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  citationIds: [`citation:${id}`],
  keywords,
  rationale: "Test topic",
});

const topicGroup = (
  nodes: readonly ReaderSummaryTopicMapNode[],
  id = "group:openai-ecosystem",
  label = "OpenAI Ecosystem",
): ReaderSummaryTopicMapGroup => ({
  id,
  label,
  colorKey: id === "group:ungrouped" ? "slate" : "blue",
  nodeIds: nodes.map((node) => node.id),
  confidence: {
    level: "high",
    score: 0.9,
    rationale: "Test group",
  },
});
