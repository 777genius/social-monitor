import { InMemoryFeedItemReadRepository } from
  "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import { withTestExecutionAttestation } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation.spec-support";
import type { VerifiedReaderSummaryExecutionAttestation } from
  "@social-monitor/summary/adapters/model/reader-summary-execution-attestation";
import {
  buildReaderSummaryCoveragePlan,
  buildReaderSummaryPeriod,
} from "@social-monitor/summary/domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "@social-monitor/summary/ports";
import { FixedClock, tenantId, workspaceId, type JsonObject } from
  "@social-monitor/shared-kernel";

import * as dailyPublicationFinalizer from
  "./reader-summary-daily-publication-finalizer";
import { createReaderSummaryDailyCapturePublicationWiring } from
  "./reader-summary-daily-story-relation-verifier";

const now = new Date("2026-08-31T12:00:00.000Z");
const clock = new FixedClock(now);
const tenant = tenantId("tenant-daily-story-wiring");
const workspace = workspaceId("workspace-daily-story-wiring");
const period = buildReaderSummaryPeriod({
  cadence: "daily",
  startedAt: new Date("2026-08-31T00:00:00.000Z"),
  endedAt: new Date("2026-09-01T00:00:00.000Z"),
  timezone: "UTC",
});

describe("reader summary daily story relation production wiring", () => {
  it("fails fresh live wiring closed and keeps non-live paths verifier-free", async () => {
    expect(() => createReaderSummaryDailyCapturePublicationWiring({
      replay: null,
      feedItems: feedRepository(),
      summaryClient: {} as never,
      clock,
      attestationSink: { record: jest.fn(async () => undefined) },
      summaryModelMode: "agent-runtime",
      env: {},
      agentRuntimeClient: null,
    })).toThrow(
      "Fresh agent-runtime daily publication requires a story relation verifier client",
    );

    const localRuntime = new FakeRuntime(true, true);
    const localWiring = createReaderSummaryDailyCapturePublicationWiring({
      replay: null,
      feedItems: feedRepository(),
      summaryClient: {} as never,
      clock,
      attestationSink: { record: jest.fn(async () => undefined) },
      summaryModelMode: "deterministic",
      env: {},
      agentRuntimeClient: localRuntime,
    });
    await localWiring.evidenceSelector.select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });
    expect(localRuntime.storyCommands).toHaveLength(0);

    const frozenRuntime = new FakeRuntime(true, true);
    const frozenReplay = Object.freeze({
      outputKind: "output_text" as const,
    }) as never;
    const executionFactory = jest.spyOn(
      dailyPublicationFinalizer,
      "createReaderSummaryDailyPublicationExecutionWiring",
    ).mockReturnValue({} as never);
    try {
      createReaderSummaryDailyCapturePublicationWiring({
        replay: frozenReplay,
        feedItems: feedRepository(),
        summaryClient: {} as never,
        clock,
        attestationSink: { record: jest.fn(async () => undefined) },
        summaryModelMode: "agent-runtime",
        env: {},
        agentRuntimeClient: frozenRuntime,
      });
      expect(executionFactory).toHaveBeenCalledWith(expect.objectContaining({
        replay: frozenReplay,
        storyRelationVerifier: null,
      }));
    } finally {
      executionFactory.mockRestore();
    }
    expect(frozenRuntime.storyCommands).toHaveLength(0);
  });

  it("groups promoted cross-source evidence through the concrete runtime adapter", async () => {
    const result = await selectDailyEvidence({
      sameStory: true,
      attested: true,
      secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
    });

    expect(result.runtime.storyCommands).toHaveLength(1);
    expect(result.selection.clusters).toHaveLength(1);
    expect(result.selection.clusters[0]?.providerKeys).toEqual([
      "hacker-news",
      "reddit",
    ]);
    expect(result.selection.approvedSameStoryRelations).toEqual([{
      leftFeedItemId: "typescript-hn",
      rightFeedItemId: "typescript-reddit",
      confidence: 0.98,
    }]);
    expect(buildReaderSummaryCoveragePlan(result.selection).lead).toMatchObject({
      feedItemIds: ["typescript-hn", "typescript-reddit"],
      providerKeys: ["hacker-news", "reddit"],
    });
    expect(result.record).toHaveBeenCalledWith(expect.objectContaining({
      taskRole: "story_relation",
      attempt: "primary",
      attestation: expect.objectContaining({
        purpose: "social_monitor.reader_summary.verify_story_relations.v2",
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      }),
    }));
  });

  it.each([
    {
      name: "an unrelated question sharing product names",
      sameStory: false,
      attested: true,
      secondTitle: "Should a TypeScript compiler rewrite move to Go?",
      storyAttestationRecorded: true,
    },
    {
      name: "an approving response with a failed attestation",
      sameStory: true,
      attested: false,
      secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
      storyAttestationRecorded: false,
    },
  ])("keeps $name ungrouped", async (scenario) => {
    const result = await selectDailyEvidence(scenario);

    expect(result.runtime.storyCommands).toHaveLength(1);
    expect(result.selection.clusters).toHaveLength(2);
    expect(result.selection.approvedSameStoryRelations).toEqual([]);
    expect(result.record.mock.calls.some(([record]) =>
      record.taskRole === "story_relation",
    )).toBe(scenario.storyAttestationRecorded);
  });
});

const selectDailyEvidence = async (input: {
  readonly sameStory: boolean;
  readonly attested: boolean;
  readonly secondTitle: string;
}) => {
  const runtime = new FakeRuntime(input.sameStory, input.attested);
  const record = jest.fn(async (value: VerifiedReaderSummaryExecutionAttestation) => {
    void value;
  });
  const wiring = createReaderSummaryDailyCapturePublicationWiring({
    replay: null,
    feedItems: feedRepository(input.secondTitle),
    summaryClient: {} as never,
    clock,
    attestationSink: { record },
    summaryModelMode: "agent-runtime",
    env: {},
    agentRuntimeClient: runtime,
  });
  const selection = await wiring.evidenceSelector.select({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    maxItems: 2,
  });
  return { record, runtime, selection };
};

const feedRepository = (
  secondTitle = "Go rewrite of the TypeScript compiler reaches developers",
): InMemoryFeedItemReadRepository => {
  const repository = new InMemoryFeedItemReadRepository();
  repository.upsert(feedItem({
    id: "typescript-hn",
    providerKey: "hacker-news",
    title: "TypeScript compiler rewrite moves to Go",
    bodyPreview: "Microsoft details the plan for AI-assisted editors.",
    providerMetadata: {
      kind: "hacker_news_story",
      points: 210,
      promotionAuthority: {
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      interestQuerySnapshot: {
        query: "TypeScript, developer tools",
      },
    },
  }));
  repository.upsert(feedItem({
    id: "typescript-reddit",
    providerKey: "reddit",
    title: secondTitle,
    bodyPreview: secondTitle.startsWith("Should")
      ? "A forum question compares compiler choices for coding agents."
      : "The engineering team explains the pipeline for coding agents.",
    providerMetadata: {
      kind: "reddit_post",
      score: 190,
      promotionAuthority: {
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      interestQuerySnapshot: {
        query: "TypeScript, developer tools",
      },
    },
  }));
  return repository;
};

const feedItem = (input: {
  readonly id: string;
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly providerMetadata: JsonObject;
}) => FeedItem.publish({
  id: input.id,
  tenantId: tenant,
  workspaceId: workspace,
  interestId: "interest-ai",
  sourceItemId: `source-${input.id}`,
  sourceBindingId: `binding-${input.providerKey}`,
  providerKey: input.providerKey,
  canonicalUrl: `https://${input.providerKey}.example.test/${input.id}`,
  title: input.title,
  bodyPreview: input.bodyPreview,
  publishedAt: new Date("2026-08-31T08:00:00.000Z"),
  observedAt: new Date("2026-08-31T08:01:00.000Z"),
  providerMetadata: input.providerMetadata,
});

class FakeRuntime implements AgentRuntimeClientPort {
  readonly storyCommands: AgentRuntimeTaskCommand[] = [];

  constructor(
    private readonly sameStory: boolean,
    private readonly attested: boolean,
  ) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    const storyRelation = command.purpose ===
      "social_monitor.reader_summary.verify_story_relations.v2";
    if (storyRelation) this.storyCommands.push(command);
    const result: AgentRuntimeTaskResult = {
      status: "completed",
      structuredOutput: {
        decisions: storyRelation
          ? [{
              leftFeedItemId: "typescript-hn",
              rightFeedItemId: "typescript-reddit",
              sameStory: this.sameStory,
              confidenceScore: 0.98,
            }]
          : [],
      },
      warnings: [],
    };
    return this.attested
      ? withTestExecutionAttestation(command, result)
      : result;
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "fake-daily-runtime",
      runtimeVersion: "1",
      warnings: [],
    };
  }
}
