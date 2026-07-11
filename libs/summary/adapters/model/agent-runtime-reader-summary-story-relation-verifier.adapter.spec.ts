import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "./agent-runtime-reader-summary-story-relation-verifier.adapter";

describe("AgentRuntimeReaderSummaryStoryRelationVerifier", () => {
  it("uses subscription runtime and decides every shortlisted pair", async () => {
    const client = new CapturingAgentRuntimeClient({
      status: "completed",
      structuredOutput: {
        decisions: [
          {
            leftFeedItemId: "feed:hn",
            rightFeedItemId: "feed:rss",
            sameStory: true,
            confidenceScore: 0.96,
            rationale: "Both report the same compiler rewrite.",
          },
        ],
      },
      warnings: [],
    });
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client,
    });

    await expect(verifier.verify(input())).resolves.toEqual([
      {
        leftFeedItemId: "feed:hn",
        rightFeedItemId: "feed:rss",
        sameStory: true,
        confidenceScore: 0.96,
        rationale: "Both report the same compiler rewrite.",
      },
    ]);
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.verify_story_relations",
      metadata: {
        promptVersion: "reader_summary.story_relation.agent_runtime.v1",
      },
    });
    expect(
      JSON.parse(client.commands[0]?.prompt ?? "{}").pairs[0],
    ).toMatchObject({
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      retrievalSignals: {
        sharedTopicTokens: ["compiler", "rewrite", "typescript"],
      },
      left: {
        providerKey: "hacker-news",
        title: "TypeScript compiler rewrite moves to Go",
      },
    });
  });

  it("rejects unknown, duplicate, or incomplete decisions", async () => {
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
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

const input = (): ReaderSummaryStoryRelationVerifierInput => ({
  tenantId: tenantId("tenant-story-verifier"),
  workspaceId: workspaceId("workspace-story-verifier"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-11T00:00:00.000Z"),
    endedAt: new Date("2026-07-12T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "2026-07-11",
  },
  requestedAt: new Date("2026-07-12T01:00:00.000Z"),
  clusters: [],
  evidence: [
    evidence(
      "feed:hn",
      "hacker-news",
      "TypeScript compiler rewrite moves to Go",
    ),
    evidence("feed:rss", "rss", "Go rewrite changes the TypeScript compiler"),
  ],
  candidates: [
    {
      leftFeedItemId: "feed:hn",
      rightFeedItemId: "feed:rss",
      leftClusterId: "story:hn",
      rightClusterId: "story:rss",
      sharedTopicTokens: ["compiler", "rewrite", "typescript"],
      sharedAnchorTokens: [],
      sharedEventTokens: [],
      sharedSpecificProductTokens: [],
      topicSimilarity: 0.3,
    },
  ],
});

const evidence = (feedItemId: string, providerKey: string, title: string) => ({
  feedItemId,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: `binding:${providerKey}`,
  interestId: "ai",
  providerKey,
  canonicalUrl: `https://example.test/${feedItemId}`,
  title,
  bodyPreview: "The engineering team published implementation details.",
  publishedAt: new Date("2026-07-11T08:00:00.000Z"),
  observedAt: new Date("2026-07-11T08:01:00.000Z"),
  score: 2,
  whyImportant: ["Fixture"],
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
