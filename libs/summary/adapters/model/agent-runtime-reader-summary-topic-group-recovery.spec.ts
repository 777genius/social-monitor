import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { recoverGroundedTopicGroups } from "./agent-runtime-reader-summary-topic-group-recovery";

describe("recoverGroundedTopicGroups", () => {
  it("recovers only concrete anchors shared by at least two ungrouped nodes", () => {
    const candidates = [
      candidate("openai-gpt", "OpenAI GPT", ["OpenAI", "GPT"]),
      candidate("openai-chatgpt", "OpenAI ChatGPT", ["OpenAI", "ChatGPT"]),
      candidate("anthropic-claude", "Anthropic Claude", [
        "Anthropic",
        "Claude",
      ]),
      candidate("anthropic-api", "Anthropic API", ["Anthropic", "API"]),
      candidate("mcp-server", "MCP Server", ["MCP", "server"]),
      candidate("mcp-client", "MCP Client", ["MCP", "client"]),
    ];

    const result = recoverGroundedTopicGroups({
      nodeLabels: candidates.map((item) => ({
        nodeId: item.nodeId,
        label: item.fallbackLabel,
        groupId: READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
        keywords: ["AI", ...item.keywords],
      })),
      candidates,
      explicitAnchorsByGroup: new Map(),
    });

    expect(result.recoveredNodeCount).toBe(6);
    expect(new Set(result.nodeLabels.map((item) => item.groupId))).toEqual(
      new Set(["group:openai", "group:anthropic", "group:mcp"]),
    );
    expect(result.nodeLabels.some((item) => item.groupId === "group:ai")).toBe(
      false,
    );
  });

  it("joins an ungrouped node to exactly one supported existing group", () => {
    const candidates = [
      candidate("openai-gpt", "OpenAI GPT", ["OpenAI", "GPT", "Codex"]),
      candidate("openai-chatgpt", "OpenAI ChatGPT", [
        "OpenAI",
        "ChatGPT",
        "Codex",
      ]),
      candidate("openai-limits", "OpenAI Limits", ["OpenAI", "limits"]),
      candidate("ambiguous", "Claude Codex", ["Claude", "Codex"]),
      candidate("ai-content", "AI Content", ["Fable", "content"]),
      candidate("anthropic-course", "Claude Course", ["Claude", "course"]),
      candidate("anthropic-code", "Claude Code", ["Claude", "code"]),
      candidate("anthropic-limits", "Anthropic Limits", [
        "Anthropic",
        "limits",
      ]),
    ];
    const result = recoverGroundedTopicGroups({
      nodeLabels: candidates.map((item) => ({
        nodeId: item.nodeId,
        label: item.fallbackLabel,
        groupId:
          item.nodeId.includes("openai-gpt") ||
          item.nodeId.includes("openai-chatgpt")
            ? "group:openai"
            : item.nodeId.includes("anthropic-course") ||
                item.nodeId.includes("anthropic-code")
              ? "group:anthropic"
              : READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID,
        keywords: item.keywords,
      })),
      candidates,
      explicitAnchorsByGroup: new Map(),
    });

    expect(
      result.nodeLabels.find((item) => item.nodeId === "topic:openai-limits")
        ?.groupId,
    ).toBe("group:openai");
    expect(
      result.nodeLabels.find((item) => item.nodeId === "topic:ambiguous")
        ?.groupId,
    ).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
    expect(
      result.nodeLabels.find((item) => item.nodeId === "topic:anthropic-limits")
        ?.groupId,
    ).toBe("group:anthropic");
    expect(result.recoveredNodeCount).toBe(2);
    expect(
      result.nodeLabels.find((item) => item.nodeId === "topic:ai-content")
        ?.groupId,
    ).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
  });

  it("never recovers a low-confidence semantic assignment", () => {
    const candidates = [
      candidate("openai-gpt", "OpenAI GPT", ["OpenAI", "GPT"]),
      candidate("openai-codex", "OpenAI Codex", ["OpenAI", "Codex"]),
      candidate("openai-rumor", "OpenAI Rumor", ["OpenAI", "rumor"]),
    ];
    const result = recoverGroundedTopicGroups({
      nodeLabels: candidates.map((item) => ({
        nodeId: item.nodeId,
        label: item.fallbackLabel,
        groupId:
          item.nodeId === "topic:openai-rumor"
            ? READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID
            : "group:openai",
        keywords: item.keywords,
        semantic: {
          subject: item.fallbackLabel,
          claimType: "other" as const,
          confidenceScore: item.nodeId === "topic:openai-rumor" ? 0.4 : 0.9,
        },
      })),
      candidates,
      explicitAnchorsByGroup: new Map(),
    });

    expect(
      result.nodeLabels.find((item) => item.nodeId === "topic:openai-rumor")
        ?.groupId,
    ).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
    expect(result.recoveredNodeCount).toBe(0);
  });
});

const candidate = (
  id: string,
  fallbackLabel: string,
  keywords: readonly string[],
): ReaderSummaryTopicLabelCandidate => ({
  nodeId: `topic:${id}`,
  storyClusterId: `story:${id}`,
  fallbackLabel,
  score: 10,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  keywords,
  labelCandidates: [],
});
