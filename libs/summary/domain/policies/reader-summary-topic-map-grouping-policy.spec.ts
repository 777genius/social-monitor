import type { ReaderSummaryTopicMapNode } from "../entities/reader-summary-topic-map";
import {
  applyReaderSummaryTopicMapGroupingPolicy,
  READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
} from "./reader-summary-topic-map-grouping-policy";

describe("reader summary topic map grouping policy", () => {
  it("keeps supported semantic groups and neutralizes unrelated or singleton groups", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy([
      node("gpt-launch", "GPT-5 Launch", "group:openai-models", ["OpenAI"]),
      node("gpt-api", "GPT-5 API", "group:openai-models", ["OpenAI API"]),
      node("grok-workflows", "Grok Workflows", "topic:claude-code", ["Grok"]),
      node("grok-run", "Grok Run", "topic:claude-code", ["Grok"]),
      node("postgres", "Postgres Scaling", "topic:postgres", ["Postgres"]),
    ]);

    expect(nodes.map((item) => item.groupId)).toEqual([
      "group:openai-models",
      "group:openai-models",
      "group:ungrouped",
      "group:ungrouped",
      "group:ungrouped",
    ]);
  });

  it("retains at most eight evidence-supported semantic groups", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy(
      Array.from({ length: 9 }, (_, groupIndex) => [
        node(
          `family-${groupIndex}-a`,
          `Family ${groupIndex} Alpha`,
          `group:family-${groupIndex}`,
          [`Family ${groupIndex}`],
          100 - groupIndex,
        ),
        node(
          `family-${groupIndex}-b`,
          `Family ${groupIndex} Beta`,
          `group:family-${groupIndex}`,
          [`Family ${groupIndex}`],
          100 - groupIndex,
        ),
      ]).flat(),
    );
    const semanticGroupIds = new Set(
      nodes
        .map((item) => item.groupId)
        .filter((groupId) => groupId !== "group:ungrouped"),
    );

    expect(semanticGroupIds.size).toBe(
      READER_SUMMARY_TOPIC_MAP_MAX_SEMANTIC_GROUPS,
    );
    expect(
      nodes.filter((item) => item.groupId === "group:ungrouped"),
    ).toHaveLength(2);
  });

  it("keeps a canonical LLM group when shared evidence anchors support it", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy(
      [
        node("grok-model", "Grok 4.5", "group:xai-ecosystem", ["Grok"]),
        node("grok-build", "Grok Build", "group:xai-ecosystem", ["Grok"]),
      ],
      {
        semanticAnchorsByGroup: new Map([
          ["group:xai-ecosystem", ["Grok", "xAI"]],
        ]),
      },
    );

    expect(nodes.map((item) => item.groupId)).toEqual([
      "group:xai-ecosystem",
      "group:xai-ecosystem",
    ]);
  });

  it("neutralizes a node that has no shared evidence anchor with its proposed group", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy(
      [
        node("gpt-api", "GPT-5 API", "group:openai-models", ["GPT-5"]),
        node(
          "gpt-efficiency",
          "GPT-5 Token Efficiency",
          "group:openai-models",
          ["GPT-5"],
        ),
        node("version-control", "Version Control", "group:openai-models", [
          "Version Control",
        ]),
      ],
      {
        semanticAnchorsByGroup: new Map([
          ["group:openai-models", ["GPT-5", "OpenAI"]],
        ]),
      },
    );

    expect(nodes.map((item) => item.groupId)).toEqual([
      "group:openai-models",
      "group:openai-models",
      "group:ungrouped",
    ]);
  });

  it("keeps one parent-identity node in an otherwise shared product group", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy(
      [
        node("claude-course", "Claude Course", "group:anthropic-ecosystem", [
          "Claude",
        ]),
        node("claude-skill", "Claude Code Skill", "group:anthropic-ecosystem", [
          "Claude",
        ]),
        node(
          "anthropic-limits",
          "Anthropic Weekly Limits",
          "group:anthropic-ecosystem",
          ["Anthropic"],
        ),
      ],
      {
        semanticAnchorsByGroup: new Map([
          ["group:anthropic-ecosystem", ["Claude"]],
        ]),
      },
    );

    expect(nodes.map((item) => item.groupId)).toEqual([
      "group:anthropic-ecosystem",
      "group:anthropic-ecosystem",
      "group:anthropic-ecosystem",
    ]);
  });

  it("recovers neutral nodes from one uniquely supported leading identity", () => {
    const nodes = applyReaderSummaryTopicMapGroupingPolicy(
      [
        node("claude-course", "Claude Code Course", "group:anthropic", [
          "Claude",
        ]),
        node("claude-skill", "Claude Code Skill", "group:anthropic", [
          "Claude",
        ]),
        node("claude-reflect", "Claude Reflect", "group:ungrouped", ["Claude"]),
        node("claude-scam", "Claude Scam", "group:ungrouped", ["Claude"]),
        node("mixed-claude", "Claude code Grok 4.5", "group:xai", ["Grok"]),
        node("grok-game", "Grok FPS Game", "group:xai", ["Grok"]),
      ],
      {
        semanticAnchorsByGroup: new Map([
          ["group:anthropic", ["Anthropic", "Claude Code"]],
          ["group:xai", ["xAI", "Grok"]],
        ]),
      },
    );

    expect(
      nodes
        .filter((item) => item.id.startsWith("topic:claude-"))
        .map((item) => item.groupId),
    ).toEqual([
      "group:anthropic",
      "group:anthropic",
      "group:anthropic",
      "group:anthropic",
    ]);
    expect(
      nodes.find((item) => item.id === "topic:mixed-claude")?.groupId,
    ).toBe("group:xai");
  });
});

const node = (
  id: string,
  label: string,
  groupId: string,
  keywords: readonly string[],
  popularityScore = 50,
): ReaderSummaryTopicMapNode => ({
  id: `topic:${id}`,
  label,
  groupId,
  storyClusterIds: [`story:${id}`],
  popularityScore,
  sizeWeight: 0.7,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  citationIds: [`citation:${id}`],
  keywords,
  rationale: "Grouping policy fixture",
});
