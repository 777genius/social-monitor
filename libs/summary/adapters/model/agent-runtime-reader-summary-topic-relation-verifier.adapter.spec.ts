import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryTopicRelationVerifierInput,
} from "../../ports";
import { AgentRuntimeReaderSummaryTopicRelationVerifier } from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";
import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";

describe("AgentRuntimeReaderSummaryTopicRelationVerifier", () => {
  it("uses the shared runtime and parses one decision per requested pair", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        decisions: [
          {
            sourceNodeId: "node:a",
            targetNodeId: "node:b",
            sameTopic: true,
            confidenceScore: 0.94,
            rationale: "Both announce the same work product.",
          },
        ],
      },
      warnings: [],
    });
    const verifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({
      client,
    });

    await expect(
      verifier.verify(input(), { attemptNumber: 1, totalAttempts: 2 }),
    ).resolves.toEqual([
      {
        sourceNodeId: "node:a",
        targetNodeId: "node:b",
        sameTopic: true,
        confidenceScore: 0.94,
        rationale: "Both announce the same work product.",
      },
    ]);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.topic_map.verify_relations.v2",
      metadata: {
        promptVersion: "reader_summary.topic_relation.agent_runtime.v3",
        attemptNumber: "1",
        totalAttempts: "2",
      },
    });
    expect(
      JSON.parse(client.commands[0]?.prompt ?? "{}").pairs[0],
    ).toMatchObject({
      sharedTerms: ["codex", "work"],
      source: {
        label: "ChatGPT Work Rollout",
        subject: "ChatGPT Work Rollout",
        claimType: "release",
        parentSubject: "OpenAI",
        semanticConfidenceScore: 0.9,
        evidenceSamples: [expect.objectContaining({ authorHandle: "openai" })],
      },
    });

    await verifier.verify(input(), { attemptNumber: 2, totalAttempts: 2 });
    expect(client.commands[1]?.requestId).not.toBe(
      client.commands[0]?.requestId,
    );
    expect(client.commands[1]?.correlationId).toBe(
      client.commands[0]?.correlationId,
    );
    expect(client.commands[1]?.metadata).toMatchObject({
      attemptNumber: "2",
      totalAttempts: "2",
    });
  });

  it("rejects incomplete pair decisions", async () => {
    const verifier = new AgentRuntimeReaderSummaryTopicRelationVerifier({
      client: new CapturingAgentRuntimeClient({
        status: "completed",
        structuredOutput: { decisions: [] },
        warnings: [],
      }),
    });

    await expect(verifier.verify(input())).rejects.toThrow(
      "must decide every requested pair exactly once",
    );
  });
});

const input = (): ReaderSummaryTopicRelationVerifierInput => ({
  tenantId: tenantId("tenant-relation-verifier"),
  workspaceId: workspaceId("workspace-relation-verifier"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-10T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-07-09",
  },
  requestedAt: new Date("2026-07-10T01:00:00.000Z"),
  clusters: [cluster("story:a", "feed:a"), cluster("story:b", "feed:b")],
  selectedEvidence: [
    evidence("feed:a", "openai", "ChatGPT Work launches with Codex"),
    evidence("feed:b", "sama", "Codex powers our new work product"),
  ],
  candidates: [candidate("node:a", "story:a"), candidate("node:b", "story:b")],
  labelPlan: {
    nodeLabels: [
      label("node:a", "topic:chatgpt-work", "ChatGPT Work Rollout"),
      label("node:b", "topic:codex-work", "Codex Work Rollout"),
    ],
    groups: [],
  },
  relations: [
    {
      sourceNodeId: "node:a",
      targetNodeId: "node:b",
      sharedTerms: ["codex", "work"],
    },
  ],
});

const cluster = (id: string, representativeFeedItemId: string) => ({
  id,
  storyKey: id,
  representativeFeedItemId,
  duplicateFeedItemIds: [],
  interestIds: ["ai"],
  providerKeys: ["x-twitter"],
  score: 2,
  observedAtRange: {
    startedAt: new Date("2026-07-09T01:00:00.000Z"),
    endedAt: new Date("2026-07-09T01:00:00.000Z"),
  },
  whyImportant: ["Fixture"],
});

const evidence = (feedItemId: string, authorHandle: string, title: string) => ({
  feedItemId,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: "binding:x",
  interestId: "ai",
  providerKey: "x-twitter",
  canonicalUrl: `https://x.test/${feedItemId}`,
  title,
  authorHandle,
  publishedAt: new Date("2026-07-09T01:00:00.000Z"),
  observedAt: new Date("2026-07-09T01:01:00.000Z"),
  score: 2,
  whyImportant: ["Fixture"],
});

const candidate = (nodeId: string, storyClusterId: string) => ({
  nodeId,
  storyClusterId,
  fallbackLabel: nodeId,
  score: 50,
  evidenceCount: 1,
  providerKeys: ["x-twitter"],
  interestIds: ["ai"],
  keywords: ["codex", "work"],
  labelCandidates: [],
});

const label = (nodeId: string, topicId: string, value: string) => ({
  nodeId,
  topicId,
  label: value,
  semantic: {
    subject: value,
    parentSubject: "OpenAI",
    claimType: "release" as const,
    confidenceScore: 0.9,
  },
  groupId: "group:openai",
});

class CapturingAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  constructor(private readonly result: AgentRuntimeTaskResult) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);

    return withTestExecutionAttestation(command, this.result);
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
