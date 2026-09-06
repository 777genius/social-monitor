import { InMemoryFeedItemReadRepository } from
  "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import { FeedItem } from "@social-monitor/feed/domain";
import type { ReadPromotionFeedItemSnapshotQuery } from
  "@social-monitor/feed/ports";
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
import { resolveProductionDayExecutionRequest } from
  "./reader-summary-production-day-reuse-provenance";

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

  it("reclusters an approved attested relation before composing the slate", async () => {
    const result = await selectDailyEvidence({
      sameStory: true,
      attested: true,
      secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
    });

    expect(result.runtime.storyCommands).toHaveLength(1);
    expect(result.selection.clusters).toHaveLength(1);
    expect(result.selection.clusters.map((cluster) => cluster.providerKeys))
      .toEqual([["hacker-news", "reddit"]]);
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
      name: "Cursor and SpaceX deployment",
      firstTitle: "Cursor deployed at SpaceX",
      secondTitle: "SpaceX deploying Cursor",
    },
    {
      name: "strong Claude watermark report",
      firstTitle: "Claude's snippets are watermarked",
      secondTitle: "Watermarking Claude Code output",
    },
  ])("groups an attested $name through the runtime verifier", async (scenario) => {
    const result = await selectDailyEvidence({
      ...scenario,
      sameStory: true,
      attested: true,
    });

    expect(result.runtime.storyCommands).toHaveLength(1);
    expect(result.selection.clusters).toHaveLength(1);
    expect(result.selection.approvedSameStoryRelations).toHaveLength(1);
  });

  it("keeps historical Promotion V2 on the real verifier/finalizer wiring", async () => {
    const request = resolveProductionDayExecutionRequest([
      "--regenerate-after-passed-collection",
      "--promotion-v2-rebuild",
      "--promotion-rebuild-identity", "1".repeat(64),
      "--promotion-source-authority-kind", "active-database-publication",
      "--authoritative-input-sha256", "2".repeat(64),
      "--promotion-authority-inspection-sha256", "8".repeat(64),
      "--source-publication-id", "00000000-0000-4000-8000-000000000101",
      "--source-artifact-id", "00000000-0000-4000-8000-000000000102",
      "--source-publication-report-sha256", "3".repeat(64),
      "--source-publication-proof-sha256", "4".repeat(64),
      "--reuse-dataset-manifest", "/evidence/dataset.json",
      "--reuse-dataset-manifest-sha256", "5".repeat(64),
      "--recovery-timestamp-policy", "published_at",
    ]);
    expect(request).toMatchObject({
      mode: "historical-regeneration",
      sourceEvidence: { kind: "active-database-publication" },
      promotionRebuild: {
        sourceAuthorityKind: "active-database-publication",
      },
    });
    const realFinalizer =
      dailyPublicationFinalizer.createReaderSummaryDailyPublicationExecutionWiring;
    const finalizer = jest.spyOn(
      dailyPublicationFinalizer,
      "createReaderSummaryDailyPublicationExecutionWiring",
    ).mockImplementation((input) => realFinalizer(input));
    try {
      const selected = await selectDailyEvidence({
        sameStory: true,
        attested: true,
        secondTitle:
          "Go rewrite of the TypeScript compiler reaches developers",
      });
      expect(selected.runtime.storyCommands).toHaveLength(1);
      expect(finalizer).toHaveBeenCalledWith(expect.objectContaining({
        replay: null,
        storyRelationVerifier: expect.any(Object),
      }));
    } finally {
      finalizer.mockRestore();
    }
  });

  it.each([
    {
      name: "a weak question sharing product names",
      sameStory: false,
      attested: true,
      secondTitle: "Should a TypeScript compiler rewrite move to Go?",
      storyAttestationRecorded: true,
      runtimeCommandCount: 1,
    },
    {
      name: "an unrelated report",
      sameStory: false,
      attested: true,
      firstTitle: "Cursor deployed at SpaceX",
      secondTitle: "Cursor deployed at a university",
      storyAttestationRecorded: false,
      runtimeCommandCount: 0,
    },
    {
      name: "an approving response with a failed attestation",
      sameStory: true,
      attested: false,
      secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
      storyAttestationRecorded: false,
      runtimeCommandCount: 1,
    },
  ])("keeps $name ungrouped", async (scenario) => {
    const result = await selectDailyEvidence(scenario);

    expect(result.runtime.storyCommands).toHaveLength(scenario.runtimeCommandCount);
    expect(result.selection.clusters).toHaveLength(2);
    expect(result.selection.approvedSameStoryRelations).toEqual([]);
    expect(result.record.mock.calls.some(([record]) =>
      record.taskRole === "story_relation",
    )).toBe(scenario.storyAttestationRecorded);
  });

  it("keeps same-provider evidence separate without requesting a relation", async () => {
    const result = await selectDailyEvidence({
      sameStory: true,
      attested: true,
      secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
      secondProviderKey: "hacker-news",
    });

    expect(result.runtime.storyCommands).toHaveLength(0);
    expect(result.selection.clusters).toHaveLength(2);
    expect(result.selection.approvedSameStoryRelations).toEqual([]);
  });

  it.each(["malformed", "timeout"] as const)(
    "keeps a %s runtime response separate",
    async (runtimeMode) => {
      const result = await selectDailyEvidence({
        sameStory: true,
        attested: true,
        secondTitle: "Go rewrite of the TypeScript compiler reaches developers",
        runtimeMode,
      });

      expect(result.runtime.storyCommands).toHaveLength(1);
      expect(result.selection.clusters).toHaveLength(2);
      expect(result.selection.approvedSameStoryRelations).toEqual([]);
      expect(result.record).not.toHaveBeenCalled();
    },
  );
});

const selectDailyEvidence = async (input: {
  readonly sameStory: boolean;
  readonly attested: boolean;
  readonly firstTitle?: string;
  readonly secondTitle: string;
  readonly secondProviderKey?: "hacker-news" | "reddit";
  readonly runtimeMode?: "decision" | "malformed" | "timeout";
}) => {
  const runtime = new FakeRuntime(
    input.sameStory,
    input.attested,
    input.runtimeMode ?? "decision",
  );
  const record = jest.fn(async (value: VerifiedReaderSummaryExecutionAttestation) => {
    void value;
  });
  const wiring = createReaderSummaryDailyCapturePublicationWiring({
    replay: null,
    feedItems: feedRepository({
      firstTitle: input.firstTitle,
      secondTitle: input.secondTitle,
      secondProviderKey: input.secondProviderKey,
    }),
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
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { record, runtime, selection };
};

const feedRepository = (input: {
  readonly firstTitle?: string;
  readonly secondTitle?: string;
  readonly secondProviderKey?: "hacker-news" | "reddit";
} = {},
): InMemoryFeedItemReadRepository => {
  const firstTitle = input.firstTitle ??
    "TypeScript compiler rewrite moves to Go";
  const secondTitle = input.secondTitle ??
    "Go rewrite of the TypeScript compiler reaches developers";
  const secondProviderKey = input.secondProviderKey ?? "reddit";
  const repository = new AuthorityFeedItemReadRepository();
  repository.upsert(feedItem({
    id: "typescript-hn",
    providerKey: "hacker-news",
    title: firstTitle,
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
    providerKey: secondProviderKey,
    title: secondTitle,
    bodyPreview: secondTitle.startsWith("Should")
      ? "A forum question compares compiler choices for coding agents."
      : "The engineering team explains the pipeline for coding agents.",
    providerMetadata: {
      kind: secondProviderKey === "reddit" ? "reddit_post" : "hacker_news_story",
      ...(secondProviderKey === "reddit" ? { score: 190 } : { points: 190 }),
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

class AuthorityFeedItemReadRepository extends InMemoryFeedItemReadRepository {
  override async readPromotionSnapshot(
    query: ReadPromotionFeedItemSnapshotQuery,
  ) {
    const snapshot = await super.readPromotionSnapshot(query);
    return snapshot.ok ? {
      ...snapshot,
      candidates: snapshot.candidates.map((candidate) => ({
        ...candidate,
        metricAuthority: {
          observedAt: candidate.item.toSnapshot().observedAt,
          regressionState: "stable" as const,
        },
      })),
    } : snapshot;
  }
}

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
    private readonly mode: "decision" | "malformed" | "timeout" = "decision",
  ) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    const storyRelation = command.purpose ===
      "social_monitor.reader_summary.verify_story_relations.v2";
    if (storyRelation) this.storyCommands.push(command);
    if (storyRelation && this.mode === "timeout") {
      throw new Error("fixture relation verification timed out");
    }
    const result: AgentRuntimeTaskResult = {
      status: "completed",
      structuredOutput: {
        decisions: storyRelation
          ? this.mode === "malformed"
            ? [{
                leftFeedItemId: "typescript-hn",
                rightFeedItemId: "typescript-reddit",
                sameStory: "not-a-boolean",
                confidenceScore: 2,
              }]
            : [{
              leftFeedItemId: "typescript-hn",
              rightFeedItemId: "typescript-reddit",
              sameStory: this.sameStory,
              confidenceScore: 0.98,
              rationale: this.sameStory
                ? "Both fixture reports describe the same event."
                : "The fixture question does not report the same event.",
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
