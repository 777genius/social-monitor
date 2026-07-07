import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import { AgentRuntimeReaderSummaryTopicLabeler } from "./agent-runtime-reader-summary-topic-labeler.adapter";

describe("AgentRuntimeReaderSummaryTopicLabeler", () => {
  it("uses the shared agent runtime client and parses structured labels", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        nodeLabels: [
          {
            nodeId: "topic:story:codex",
            topicId: "topic:codex-agents",
            label: "Codex agents",
            groupId: "group:agent-tools",
          },
        ],
        groups: [{ id: "group:agent-tools", label: "Agent tools" }],
      },
      warnings: [],
    });
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
      client,
      timeoutMs: 1234,
    });

    const result = await labeler.label({
      tenantId: tenantId("tenant-topic-labeler"),
      workspaceId: workspaceId("workspace-topic-labeler"),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-06-02T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "2026-06-01",
      },
      requestedAt: new Date("2026-06-02T01:00:00.000Z"),
      clusters: [
        {
          id: "story:codex",
          storyKey: "codex-agents",
          representativeFeedItemId: "feed-codex-1",
          duplicateFeedItemIds: ["feed-codex-2"],
          interestIds: ["ai-agents"],
          providerKeys: ["github-trending-page", "hacker-news"],
          score: 0.8,
          observedAtRange: {
            startedAt: new Date("2026-06-01T00:00:00.000Z"),
            endedAt: new Date("2026-06-01T01:00:00.000Z"),
          },
          whyImportant: ["Cross-source developer tooling signal"],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-codex-1",
          sourceItemId: "source-codex-1",
          sourceBindingId: "binding-codex",
          interestId: "ai-agents",
          providerKey: "github-trending-page",
          canonicalUrl: "https://example.test/codex",
          title: "openai/codex adds stronger local agent workflows",
          bodyPreview: "Developers discuss local Codex agent runtime usage.",
          publishedAt: new Date("2026-06-01T00:00:00.000Z"),
          observedAt: new Date("2026-06-01T00:10:00.000Z"),
          score: 0.8,
          whyImportant: ["Popular repository trend"],
        },
      ],
      topStories: [],
      candidates: [
        {
          nodeId: "topic:story:codex",
          storyClusterId: "story:codex",
          fallbackLabel: "openai/codex",
          score: 80,
          evidenceCount: 2,
          providerKeys: ["github-trending-page"],
          interestIds: ["ai-agents"],
          keywords: ["codex", "agents"],
          labelCandidates: [
            {
              label: "OpenAI Codex agent workflows",
              source: "evidence-title",
              score: 0.94,
              evidenceFeedItemIds: ["feed-codex-1"],
              rationale: "Derived from an evidence title.",
            },
          ],
        },
      ],
    });

    expect(result.nodeLabels).toEqual([
      {
        nodeId: "topic:story:codex",
        topicId: "topic:codex-agents",
        label: "Codex agents",
        groupId: "group:agent-tools",
        keywords: [],
        rationale: undefined,
      },
    ]);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.topic_map.label",
      timeoutMs: 1234,
    });
    expect(client.commands[0]?.systemPrompt).toContain(
      "Choose each node label from labelCandidates",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "Use the same topicId",
    );
    expect(
      JSON.parse(client.commands[0]?.prompt ?? "{}").nodes[0],
    ).toMatchObject({
      evidenceSamples: [
        {
          title: "openai/codex adds stronger local agent workflows",
          providerKey: "github-trending-page",
        },
      ],
      labelCandidates: [
        {
          label: "OpenAI Codex agent workflows",
          source: "evidence-title",
        },
      ],
    });
  });
});

class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  constructor(private readonly result: AgentRuntimeTaskResult) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);

    return this.result;
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "test",
      runtimeVersion: "test",
      warnings: [],
    };
  }
}
