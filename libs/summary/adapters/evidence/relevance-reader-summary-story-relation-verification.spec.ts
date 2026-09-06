import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  StoryRelationDecisionAggregate,
  StoryRelationSafeRecallShadowDecisionAggregate,
  StoryRelationSafeRecallShadowGenerationAggregate,
} from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort,
  StoryRankingMetricsPort,
  StoryRelationVerificationMetric,
} from "../../ports";
import { AgentRuntimeReaderSummaryStoryRelationVerifier } from "../model/agent-runtime-reader-summary-story-relation-verifier.adapter";
import { withTestExecutionAttestation } from "../model/reader-summary-execution-attestation.spec-support";
import { authoritativeReaderSummaryProviderMetadata } from
  "../../test-fixtures/reader-summary-authoritative-provider-metadata.fixture";
import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";

const now = new Date("2026-07-11T12:00:00.000Z");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-11T00:00:00.000Z"),
  endedAt: new Date("2026-07-12T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "2026-07-11",
};

const settleDetachedShadow = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
};

describe("RelevanceReaderSummaryEvidenceSelector story verification", () => {
  it("reclusters approved cross-provider pairs before slate composition", async () => {
    const verifier = new ApprovingVerifier();
    const metrics = new CapturingMetrics();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2),
        ranked("rss", "x-twitter", 1.9),
      ]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-verification"),
      workspaceId: workspaceId("workspace-story-verification"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });
    await settleDetachedShadow();

    expect(verifier.inputs).toHaveLength(1);
    expect(verifier.inputs[0]?.candidates).toHaveLength(1);
    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters.map((cluster) => cluster.providerKeys)).toEqual([
      ["hacker-news", "x-twitter"],
    ]);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual(["hn"]);
    expect(selection.approvedSameStoryRelations).toEqual([{
      leftFeedItemId: "hn",
      rightFeedItemId: "rss",
      confidence: 0.97,
    }]);
    expect(metrics.relationMetrics).toContainEqual({
      status: "completed",
      candidateCount: 1,
      approvedCount: 1,
    });
    expect(metrics.relationAggregates).toEqual([
      expect.objectContaining({
        disposition: "approved",
        count: 1,
      }),
    ]);
    expect(JSON.stringify(metrics.relationAggregates)).not.toContain(
      "Same concrete compiler rewrite.",
    );
  });

  it("keeps clusters separate when execution attestation fails", async () => {
    const metrics = new CapturingMetrics();
    const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client: new RecordedAgentRuntimeClient({
        status: "completed",
        structuredOutput: {
          decisions: [{
            leftFeedItemId: "hn",
            rightFeedItemId: "rss",
            sameStory: true,
            confidenceScore: 0.99,
            rationale: "Deterministic TEST wire annotation.",
          }],
        },
        warnings: [],
      }, false),
    });
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2),
        ranked("rss", "x-twitter", 1.9),
      ]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-verification-failure"),
      workspaceId: workspaceId("workspace-story-verification-failure"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });
    await settleDetachedShadow();

    expect(selection.clusters).toHaveLength(2);
    expect(metrics.relationMetrics).toContainEqual({
      status: "failed_closed",
      candidateCount: 1,
      approvedCount: 0,
    });
    expect(metrics.relationAggregates).toEqual([
      expect.objectContaining({
        disposition: "verifier_failed_closed",
        failureReason: "verifier_exception",
        count: 1,
      }),
    ]);
  });

  it("keeps clusters separate when relation verification times out", async () => {
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2),
        ranked("rss", "x-twitter", 1.9),
      ]),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      {
        verify: async () => {
          throw new Error("verification timed out");
        },
      },
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-verification-timeout"),
      workspaceId: workspaceId("workspace-story-verification-timeout"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(selection.clusters).toHaveLength(2);
    expect(selection.approvedSameStoryRelations).toEqual([]);
  });

  it("applies mixed approve and reject decisions through the runtime adapter and selector", async () => {
    const metrics = new CapturingMetrics();
    const runtimeVerifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
      client: new RecordedAgentRuntimeClient({
        status: "completed",
        structuredOutput: {
          decisions: [
            {
              leftFeedItemId: "hn",
              rightFeedItemId: "rss",
              sameStory: true,
              confidenceScore: 0.98,
              rationale: "Deterministic TEST wire annotation.",
            },
            {
              leftFeedItemId: "reddit",
              rightFeedItemId: "x",
              sameStory: false,
              confidenceScore: 0.98,
              rationale: "Deterministic TEST wire annotation.",
            },
          ],
        },
        warnings: [],
      }),
    });
    const verifier = new CandidatePreconditionVerifier(runtimeVerifier, [
      "hn\u0000rss",
      "reddit\u0000x",
    ]);
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2.1),
        ranked("rss", "x-twitter", 2),
        {
          ...ranked("reddit", "reddit", 1.9),
          title:
            "PostgreSQL logical slots preserve subscriber offsets during planned regional failover",
          bodyPreview:
            "A database patch retains replication progress during failover.",
        },
        {
          ...ranked("x", "x-twitter", 1.8),
          title:
            "New continuity safeguards keep subscriber offsets for PostgreSQL logical slots after promotion",
          bodyPreview:
            "Release notes cover continuity for replicas after promotion.",
        },
      ]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-mixed-story-verification"),
      workspaceId: workspaceId("workspace-mixed-story-verification"),
      scope: { type: "workspace" },
      period,
      maxItems: 4,
    });

    expect(verifier.preconditionChecked).toBe(true);
    expect(selection.clusters).toHaveLength(3);
    expect(selection.clusters.map((cluster) => cluster.providerKeys))
      .toContainEqual(["hacker-news", "x-twitter"]);
    expect(metrics.relationMetrics).toContainEqual({
      status: "completed",
      candidateCount: 2,
      approvedCount: 1,
    });
    expect(metrics.relationAggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ disposition: "approved", count: 1 }),
        expect.objectContaining({
          disposition: "rejected_same_story_false",
          count: 1,
        }),
      ]),
    );
  });

  it.each([
    ["missing", [], "missing_response"],
    [
      "duplicate",
      [
        {
          leftFeedItemId: "hn",
          rightFeedItemId: "rss",
          sameStory: true,
          confidenceScore: 0.99,
            rationale: "Deterministic TEST wire annotation.",
        },
        {
          leftFeedItemId: "rss",
          rightFeedItemId: "hn",
          sameStory: true,
          confidenceScore: 0.99,
            rationale: "Deterministic TEST wire annotation.",
        },
      ],
      "duplicate_response",
    ],
    [
      "extra-property",
      [
        {
          leftFeedItemId: "hn",
          rightFeedItemId: "rss",
          sameStory: true,
          confidenceScore: 0.99,
            rationale: "Deterministic TEST wire annotation.",
          approvalOverride: true,
        },
      ],
      // The outer schema now rejects this before domain reconciliation.
      "verifier_exception",
    ],
  ] as const)(
    "fails an adapter-to-selector %s response closed before applying any pair",
    async (_caseName, decisions, failureReason) => {
      const metrics = new CapturingMetrics();
      const verifier = new AgentRuntimeReaderSummaryStoryRelationVerifier({
        client: new RecordedAgentRuntimeClient({
          status: "completed",
          structuredOutput: { decisions },
          warnings: [],
        }),
      });
      const selector = new RelevanceReaderSummaryEvidenceSelector(
        ranker([
          ranked("hn", "hacker-news", 2),
          ranked("rss", "x-twitter", 1.9),
        ]),
        emptyFeedRepository(),
        { now: () => now },
        metrics,
        verifier,
      );

      const selection = await selector.select({
        tenantId: tenantId("tenant-invalid-story-verification"),
        workspaceId: workspaceId("workspace-invalid-story-verification"),
        scope: { type: "workspace" },
        period,
        maxItems: 2,
      });

      expect(selection.clusters).toHaveLength(2);
      expect(metrics.relationMetrics).toContainEqual({
        status: "failed_closed",
        candidateCount: 1,
        approvedCount: 0,
      });
      expect(metrics.relationAggregates).toHaveLength(1);
      expect(metrics.relationAggregates[0]?.disposition).toBe(
        "verifier_failed_closed",
      );
      expect(metrics.relationAggregates[0]?.failureReason).toBe(failureReason);
    },
  );

  it("uses verified partners in immutable-slate authority", async () => {
    const hn = ranked("hn", "hacker-news", 2.2);
    const unrelatedRss = {
      ...ranked("rss-unrelated", "x-twitter", 2.1),
      title: "Database maintenance release notes",
      bodyPreview: "A routine database patch changes backup defaults.",
    };
    const relatedRss = ranked("rss-related", "x-twitter", 1.9);
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([hn, unrelatedRss, relatedRss]),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      {
        verify: async (input) =>
          input.candidates.map((candidate) => ({
            leftFeedItemId: candidate.leftFeedItemId,
            rightFeedItemId: candidate.rightFeedItemId,
            sameStory:
              candidate.leftFeedItemId === "rss-related" ||
              candidate.rightFeedItemId === "rss-related",
            confidenceScore: 0.97,
          })),
      },
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-story-reserve"),
      workspaceId: workspaceId("workspace-story-reserve"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "hn",
      "rss-related",
      "rss-unrelated",
    ]);
    expect(selection.editorialSlate?.orderedCandidateIds).toEqual([
      "hn",
      "rss-unrelated",
    ]);
    expect(selection.clusters).toHaveLength(2);
    expect(selection.approvedSameStoryRelations).toContainEqual({
      leftFeedItemId: "hn",
      rightFeedItemId: "rss-related",
      confidence: 0.97,
    });
  });

  it("changes slate membership only for an approved relation", async () => {
    const items = [
      ranked("hn", "hacker-news", 2),
      ranked("rss", "x-twitter", 1.9),
    ];
    const selectWith = async (
      sameStory: boolean,
    ) => new RelevanceReaderSummaryEvidenceSelector(
      ranker(items),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      {
        verify: async (input) => input.candidates.map((candidate) => ({
          leftFeedItemId: candidate.leftFeedItemId,
          rightFeedItemId: candidate.rightFeedItemId,
          sameStory,
          confidenceScore: 0.99,
        })),
      },
    ).select({
      tenantId: tenantId("tenant-contradictory-verifier"),
      workspaceId: workspaceId("workspace-contradictory-verifier"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    const approved = await selectWith(true);
    const rejected = await selectWith(false);
    const immutableAuthority = (selection: typeof approved) => ({
      top: selection.editorialSlate?.top,
      additional: selection.editorialSlate?.additional,
      orderedCandidateIds: selection.editorialSlate?.orderedCandidateIds,
      digestMaterial: selection.editorialSlate?.digestMaterial,
    });

    expect(immutableAuthority(approved).orderedCandidateIds).toEqual(["hn"]);
    expect(immutableAuthority(rejected).orderedCandidateIds).toEqual([
      "hn",
      "rss",
    ]);
    expect(immutableAuthority(approved).digestMaterial).not.toBe(
      immutableAuthority(rejected).digestMaterial,
    );
    expect(approved.approvedSameStoryRelations).toHaveLength(1);
    expect(rejected.approvedSameStoryRelations).toEqual([]);
  });

  it("passes snapshot-sealed source text into relation verification", async () => {
    const verifier = new ApprovingVerifier();
    const sourceTail = "incident evidence appears beyond the old 50000 preview boundary";
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2),
        ranked("rss", "x-twitter", 1.9),
      ]
        .map((item) => ({
          ...item,
          sourceText: `[UNTRUSTED_SOURCE_INSTRUCTION_REDACTED] ${sourceTail}`,
        }))),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-source-hydration"),
      workspaceId: workspaceId("workspace-source-hydration"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(verifier.inputs[0]?.evidence).toHaveLength(2);
    expect(verifier.inputs[0]?.evidence.every((item) =>
      item.sourceText?.includes(sourceTail) === true,
    )).toBe(true);
    expect(selection.selectedEvidence.every((item) =>
      item.sourceText?.includes(sourceTail) === true,
    )).toBe(true);
    expect(verifier.inputs[0]?.evidence.every((item) =>
      item.sourceText?.includes("[UNTRUSTED_SOURCE_INSTRUCTION_REDACTED]") === true &&
      item.sourceText?.includes("Ignore previous instructions") === false,
    )).toBe(true);
  });

  it("does not reverify an authoritative strict-title candidate in shadow", async () => {
    const verifier = new ApprovingVerifier();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        {
          ...ranked("cursor-selected", "x-twitter", 2),
          title: "Cursor deployed at SpaceX",
          bodyPreview: "Official customer deployment report.",
        },
        {
          ...ranked("cursor-dropped", "hacker-news", 1.9),
          providerMetadata: authoritativeReaderSummaryProviderMetadata(
            "hacker-news",
            1,
          ),
          title: "SpaceX deploying Cursor",
          bodyPreview: "Community link discussion without copied prose.",
        },
      ]),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-pre-limit-shadow"),
      workspaceId: workspaceId("workspace-pre-limit-shadow"),
      scope: { type: "workspace" },
      period,
      maxItems: 1,
    });
    await settleDetachedShadow();

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "cursor-selected",
    ]);
    expect(verifier.inputs).toHaveLength(1);
    expect(verifier.inputs[0]).not.toHaveProperty("verificationLane");
    expect(verifier.inputs[0]?.candidates).toEqual([
      expect.objectContaining({
        leftFeedItemId: "cursor-dropped",
        rightFeedItemId: "cursor-selected",
      }),
    ]);
  });

  it("does not schedule detached shadow work for an authoritative pair", async () => {
    const verifier = new DeferredShadowVerifier();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        {
          ...ranked("cursor-announcement", "x-twitter", 2),
          title: "Cursor deployed at SpaceX",
          bodyPreview: "Official customer story with unrelated prose.",
        },
        {
          ...ranked("cursor-coverage", "hacker-news", 1.9),
          title: "SpaceX deploying Cursor",
          bodyPreview: "HN wrapper metadata without copied article text.",
        },
      ]),
      emptyFeedRepository(),
      { now: () => now },
      new CapturingMetrics(),
      verifier,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-detached-shadow"),
      workspaceId: workspaceId("workspace-detached-shadow"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });

    expect(selection.clusters).toHaveLength(1);
    await settleDetachedShadow();
    expect(verifier.input).toBeUndefined();
  });

  it("records a weak Reddit watermark candidate as not approved once", async () => {
    const metrics = new CapturingMetrics();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        {
          ...ranked("watermark-official", "x-twitter", 2),
          title: "Claude's snippets are watermarked",
          bodyPreview: "Anthropic publication body.",
        },
        {
          ...ranked("watermark-reddit", "reddit", 1.9),
          title: "Could watermarking Claude Code output happen?",
          bodyPreview: "A user asks a general product question.",
        },
      ]),
      emptyFeedRepository(),
      { now: () => now },
      metrics,
      {
        verify: async (input) =>
          input.candidates.map((candidate) => ({
            leftFeedItemId: candidate.leftFeedItemId,
            rightFeedItemId: candidate.rightFeedItemId,
            sameStory: false,
            confidenceScore: 0.99,
            rationale: "A question is not the official announcement.",
          })),
      },
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-safe-recall-reddit"),
      workspaceId: workspaceId("workspace-safe-recall-reddit"),
      scope: { type: "workspace" },
      period,
      maxItems: 2,
    });
    await settleDetachedShadow();

    expect(selection.clusters).toHaveLength(2);
    expect(metrics.relationAggregates).toContainEqual(
      expect.objectContaining({
        disposition: "rejected_same_story_false",
        count: 1,
      }),
    );
    expect(metrics.shadowDecisionAggregates).toEqual([]);
  });

  it("keeps telemetry exceptions outside the relation decision path", async () => {
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      ranker([
        ranked("hn", "hacker-news", 2),
        ranked("rss", "x-twitter", 1.9),
      ]),
      emptyFeedRepository(),
      { now: () => now },
      new ThrowingMetrics(),
      new ApprovingVerifier(),
    );

    await expect(
      selector.select({
        tenantId: tenantId("tenant-throwing-story-metrics"),
        workspaceId: workspaceId("workspace-throwing-story-metrics"),
        scope: { type: "workspace" },
        period,
        maxItems: 2,
      }),
    ).resolves.toMatchObject({
      clusters: [
        expect.objectContaining({
          providerKeys: ["hacker-news", "x-twitter"],
        }),
      ],
    });
  });
});

const ranker = (items: readonly RankedFeedItemView[]): RankFeedItemsUseCase =>
  ({
    execute: async () =>
      ok({
        generatedAt: now.toISOString(),
        profileApplied: false,
        items,
      }),
  }) as unknown as RankFeedItemsUseCase;

const emptyFeedRepository = (): FeedItemReadRepositoryPort => ({
  readPromotionSnapshot: async () => emptyPromotionSnapshot(),
  list: async () => ({ items: [] }),
  findById: async () => null,
});

const emptyPromotionSnapshot = () => ({
  ok: true as const,
  candidates: [],
  sourceContent: [],
  physicalRowsRead: 0,
  exhausted: true as const,
});

const ranked = (
  id: string,
  providerKey: string,
  score: number,
): RankedFeedItemView => ({
  feedItemId: id,
  sourceItemId: `source-${id}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  providerMetadata: authoritativeReaderSummaryProviderMetadata(
    providerKey as "x-twitter" | "reddit" | "hacker-news",
    120,
  ),
  canonicalUrl: `https://${providerKey}.example.test/${id}`,
  title:
    providerKey === "hacker-news"
      ? "TypeScript compiler rewrite moves to Go"
      : "Go rewrite changes the TypeScript compiler",
  bodyPreview:
    providerKey === "hacker-news"
      ? "Microsoft details the native compiler migration plan."
      : "The engineering team explains its faster compiler pipeline.",
  publishedAt: "2026-07-11T08:00:00.000Z",
  observedAt: "2026-07-11T08:01:00.000Z",
  engagementAuthority: {
    observedAt: "2026-07-11T11:30:00.000Z",
    regressionState: "stable",
  },
  score,
  rank: providerKey === "hacker-news" ? 1 : 2,
  clusterId: `rank-cluster-${id}`,
  clusterSize: 1,
  duplicateFeedItemIds: [],
  whyImportant: ["Relevant today"],
  safety: {
    status: "allowed",
    categories: ["normalized_preview_only"],
    rawPayloadRetained: false,
    retentionPolicy: "normalized_preview_only",
  },
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.8,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Strong fixture evidence",
  },
});

class ApprovingVerifier implements ReaderSummaryStoryRelationVerifierPort {
  readonly inputs: ReaderSummaryStoryRelationVerifierInput[] = [];

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    this.inputs.push(input);
    return input.candidates.map((candidate) => ({
      leftFeedItemId: candidate.leftFeedItemId,
      rightFeedItemId: candidate.rightFeedItemId,
      sameStory: true,
      confidenceScore: 0.97,
      rationale: "Same concrete compiler rewrite.",
    }));
  }
}

class DeferredShadowVerifier implements ReaderSummaryStoryRelationVerifierPort {
  input?: ReaderSummaryStoryRelationVerifierInput;
  private completeVerification?: (decisions: readonly unknown[]) => void;

  verify(input: ReaderSummaryStoryRelationVerifierInput): Promise<readonly unknown[]> {
    if (input.verificationLane !== "safe_recall_shadow") {
      return Promise.resolve(input.candidates.map((candidate) => ({
        leftFeedItemId: candidate.leftFeedItemId,
        rightFeedItemId: candidate.rightFeedItemId,
        sameStory: true,
        confidenceScore: 0.99,
      })));
    }
    this.input = input;
    return new Promise((resolve) => {
      this.completeVerification = resolve;
    });
  }

  complete(): void {
    this.completeVerification?.([]);
  }
}

class RecordedAgentRuntimeClient implements AgentRuntimeClientPort {
  constructor(
    private readonly recordedResult: AgentRuntimeTaskResult,
    private readonly attested = true,
  ) {}

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    return this.attested
      ? withTestExecutionAttestation(command, this.recordedResult)
      : this.recordedResult;
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "recorded-test-runtime",
      runtimeVersion: "1",
      warnings: [],
    };
  }
}

class CandidatePreconditionVerifier implements ReaderSummaryStoryRelationVerifierPort {
  preconditionChecked = false;

  constructor(
    private readonly delegate: ReaderSummaryStoryRelationVerifierPort,
    private readonly expectedPairKeys: readonly string[],
  ) {}

  async verify(input: ReaderSummaryStoryRelationVerifierInput) {
    const pairKeys = input.candidates
      .map((candidate) =>
        [candidate.leftFeedItemId, candidate.rightFeedItemId]
          .sort()
          .join("\u0000"),
      )
      .sort();
    expect(input.candidates).toHaveLength(this.expectedPairKeys.length);
    expect(pairKeys).toEqual([...this.expectedPairKeys].sort());
    this.preconditionChecked = true;
    return this.delegate.verify(input);
  }
}

class CapturingMetrics implements StoryRankingMetricsPort {
  readonly relationMetrics: StoryRelationVerificationMetric[] = [];
  readonly relationAggregates: StoryRelationDecisionAggregate[] = [];
  readonly shadowGenerationAggregates: StoryRelationSafeRecallShadowGenerationAggregate[] = [];
  readonly shadowDecisionAggregates: StoryRelationSafeRecallShadowDecisionAggregate[] = [];

  recordStoryRanking(): void {}

  recordStoryRelationVerification(
    metric: StoryRelationVerificationMetric,
  ): void {
    this.relationMetrics.push(metric);
  }

  recordStoryRelationDecisionAggregates(
    aggregates: readonly StoryRelationDecisionAggregate[],
  ): void {
    this.relationAggregates.push(...aggregates);
  }

  recordStoryRelationSafeRecallShadowGeneration(
    aggregates: readonly StoryRelationSafeRecallShadowGenerationAggregate[],
  ): void {
    this.shadowGenerationAggregates.push(...aggregates);
  }

  recordStoryRelationSafeRecallShadowDecisions(
    aggregates: readonly StoryRelationSafeRecallShadowDecisionAggregate[],
  ): void {
    this.shadowDecisionAggregates.push(...aggregates);
  }
}

class ThrowingMetrics implements StoryRankingMetricsPort {
  recordStoryRanking(): void {
    throw new Error("ranking metric backend unavailable");
  }

  recordStoryRelationVerification(): void {
    throw new Error("verification metric backend unavailable");
  }

  recordStoryRelationDecisionAggregates(): void {
    throw new Error("decision metric backend unavailable");
  }

  recordStoryRelationSafeRecallShadowGeneration(): void {
    throw new Error("shadow generation metric backend unavailable");
  }

  recordStoryRelationSafeRecallShadowDecisions(): void {
    throw new Error("shadow decision metric backend unavailable");
  }
}
