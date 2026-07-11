import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  ReaderSummaryTopicLabelerInput,
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
        groups: [
          {
            id: "group:agent-tools",
            label: "Agent tools",
            semanticAnchors: ["Codex", "agents"],
          },
        ],
      },
      warnings: [],
    });
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
      client,
    });

    const input = {
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
    } satisfies ReaderSummaryTopicLabelerInput;
    const result = await labeler.label(input);

    expect(result.nodeLabels).toEqual([
      {
        nodeId: "topic:story:codex",
        topicId: "topic:codex-agents",
        label: "Codex agents",
        groupId: "group:ungrouped",
        keywords: [],
        rationale: undefined,
      },
    ]);
    expect(result.groups).toEqual([]);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.topic_map.label",
      timeoutMs: 600_000,
      metadata: {
        promptVersion: "reader_summary.topic_map.agent_runtime.v5",
      },
    });
    expect(client.commands[0]?.systemPrompt).toContain(
      "Choose each node label from labelCandidates",
    );
    expect(client.commands[0]?.systemPrompt).toContain("Use the same topicId");
    expect(client.commands[0]?.systemPrompt).toContain(
      "Rollout, availability, benchmark results",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "exactly one nodeLabels entry for every input node",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "single global taxonomy of 3-8 broad",
    );
    expect(client.commands[0]?.systemPrompt).toContain(
      "semanticAnchors copied from concrete entity",
    );
    expect(
      JSON.parse(client.commands[0]?.prompt ?? "{}").constraints,
    ).toMatchObject({ requireNodeLabelForEveryInput: true });
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

    const incompleteLabeler = new AgentRuntimeReaderSummaryTopicLabeler({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: { nodeLabels: [], groups: [] },
        warnings: [],
      }),
    });
    await expect(incompleteLabeler.label(input)).rejects.toThrow(
      "must label every requested node exactly once",
    );
  });

  it("caps semantic groups and neutralizes malformed group assignments", async () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      nodeId: `topic:story:${index}`,
      storyClusterId: `story:${index}`,
      fallbackLabel: `Topic ${index}`,
      score: 100 - index,
      evidenceCount: 1,
      providerKeys: ["rss"],
      interestIds: ["ai"],
      keywords: [`family-${index}`],
      labelCandidates: [],
    }));
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        nodeLabels: candidates.map((candidate, index) => ({
          nodeId: candidate.nodeId,
          label: candidate.fallbackLabel,
          groupId: index === 9 ? "topic:invalid" : `group:family-${index}`,
        })),
        groups: candidates.slice(0, 9).map((candidate, index) => ({
          id: `group:family-${index}`,
          label: `Family ${index}`,
          semanticAnchors: [`Family ${index}`],
          nodeIds: [candidate.nodeId],
          confidenceScore: 0.8,
        })),
      },
      warnings: [],
    });
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
      client,
      maxCandidates: 10,
    });

    const result = await labeler.label({
      tenantId: tenantId("tenant-topic-groups"),
      workspaceId: workspaceId("workspace-topic-groups"),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-06-02T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "2026-06-01",
      },
      requestedAt: new Date("2026-06-02T01:00:00.000Z"),
      clusters: [],
      selectedEvidence: [],
      topStories: [],
      candidates,
    });

    expect(result.groups).toHaveLength(0);
    expect(
      result.nodeLabels.filter((label) => label.groupId === "group:ungrouped"),
    ).toHaveLength(10);
    expect(result.warnings).toEqual([
      expect.stringContaining("10 topic assignments"),
    ]);
  });

  it("recovers a missing group definition from canonical assignments", async () => {
    const candidates = [0, 1].map((index) => ({
      nodeId: `topic:story:anthropic-${index}`,
      storyClusterId: `story:anthropic-${index}`,
      fallbackLabel: `Anthropic Topic ${index}`,
      score: 90 - index,
      evidenceCount: 1,
      providerKeys: ["rss"],
      interestIds: ["ai"],
      keywords: ["anthropic"],
      labelCandidates: [],
    }));
    const labeler = new AgentRuntimeReaderSummaryTopicLabeler({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: {
          nodeLabels: candidates.map((candidate) => ({
            nodeId: candidate.nodeId,
            label: candidate.fallbackLabel,
            groupId: "group:anthropic-ecosystem",
          })),
          groups: [],
        },
        warnings: [],
      }),
    });

    const result = await labeler.label({
      tenantId: tenantId("tenant-missing-group"),
      workspaceId: workspaceId("workspace-missing-group"),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-06-02T00:00:00.000Z"),
        timezone: "UTC",
        periodKey: "2026-06-01",
      },
      requestedAt: new Date("2026-06-02T01:00:00.000Z"),
      clusters: [],
      selectedEvidence: [],
      topStories: [],
      candidates,
    });

    expect(result.groups).toEqual([
      expect.objectContaining({
        id: "group:anthropic-ecosystem",
        label: "Anthropic Ecosystem",
        semanticAnchors: expect.arrayContaining(["Anthropic"]),
        confidenceScore: 0.5,
      }),
    ]);
    expect(result.warnings).toEqual([
      expect.stringContaining("1 semantic group definitions were recovered"),
      expect.stringContaining("1 semantic group anchor sets were recovered"),
    ]);
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
