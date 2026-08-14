import {
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  emptyReaderSummaryTopicMap,
  type ReaderSummaryArtifact,
  type ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationPolicy,
  ReaderSummaryJob,
  type ReaderSummaryPeriod,
  type ReaderSummaryPolicy,
  type SummaryEvidenceSelection,
  interestReaderSummaryScope,
  workspaceReaderSummaryScope,
} from "../../domain";
import type { BuildReaderSummaryTopicMapUseCase } from "../build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type {
  ListReaderSummaryPeriodSummariesResult,
  ProviderReaderSummaryAttempt,
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryContextProviderPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelFailure,
  ReaderSummaryModelPort,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationPort,
  SummaryEventPublisherPort,
  UserSummaryPreferenceReaderPort,
} from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";
import { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";

class StaticIdGenerator implements IdGenerator {
  generate(): string {
    return "reader-summary-id-1";
  }
}

const readerSummaryPeriod: ReaderSummaryPeriod = {
  cadence: "custom",
  startedAt: new Date("2026-06-26T00:00:00.000Z"),
  endedAt: new Date("2026-06-27T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "custom:2026-06-26T00:00:00.000Z:2026-06-27T00:00:00.000Z:UTC",
};

describe("ExecuteReaderSummaryJobUseCase", () => {
  it("rejects empty reader summary job ids with canonical language", async () => {
    const useCase = new ExecuteReaderSummaryJobUseCase(
      unused(),
      unused(),
      unused(),
      unused<ReaderSummaryEvidenceSelectorPort>(),
      unused(),
      unused(),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:31:00.000Z")),
      unused<ReaderSummaryContextProviderPort>(),
    );

    const result = await useCase.execute({
      tenantId: tenantId("tenant-reader-summary-use-case"),
      workspaceId: workspaceId("workspace-reader-summary-use-case"),
      readerSummaryJobId: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "validation.failed",
        message: "Reader summary job id must be non-empty",
      }),
    });
  });

  it("applies user summary preferences and memory context to reader summary generation", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();
    const model = new CapturingReaderSummaryModel();
    const publicationPolicy = new CapturingReaderSummaryPublicationPolicy();
    const requestedAt = new Date("2026-06-26T08:00:00.000Z");
    let observedMaxEvidenceItems: number | undefined;
    let observedThrough: Date | undefined;

    await jobs.save(
      ReaderSummaryJob.request({
        id: "reader-job-1",
        tenantId: tenant,
        workspaceId: workspace,
        scope: interestReaderSummaryScope("interest-reader-ai"),
        period: readerSummaryPeriod,
        userId: "user-1",
        subscriptionId: "subscription-1",
        idempotencyKey: "reader-job-key-1",
        requestedAt,
      }),
    );

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select(params) {
          observedMaxEvidenceItems = params.maxItems;
          observedThrough = params.observedThrough;
          return makeReaderEvidenceSelection();
        },
      },
      model,
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      {
        async buildContext() {
          return [
            {
              artifactId: "summary-memory:interest:interest-reader-ai",
              scope: interestReaderSummaryScope("interest-reader-ai"),
              period: readerSummaryPeriod,
              summaryText:
                "User prefers risk-first summaries for runtime regressions.",
              generatedAt: requestedAt,
              freshness: "fresh",
            },
          ];
        },
      },
      {
        async findEffectivePreference() {
          return {
            format: "risk_brief",
            tone: "concise",
            maxKeyPoints: 1,
            includeRisks: false,
            includeSourceHighlights: false,
            customInstructions: "Focus on runtime regressions.",
            rulesVersion: "summary.rules.user-preference.v1",
          };
        },
      } satisfies UserSummaryPreferenceReaderPort,
      undefined,
      publicationPolicy,
      zeroEligibleGitHubProjectionReader(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-job-1",
        status: "completed",
        readerSummaryId: "reader-summary-id-1",
      },
    });

    const snapshot = artifacts.all()[0]?.toSnapshot();
    expect(snapshot).toMatchObject({
      userId: "user-1",
      subscriptionId: "subscription-1",
      period: readerSummaryPeriod,
      executiveSummary: expect.stringContaining(
        "Focus on runtime regressions.",
      ),
      risksAndUnknowns: [],
      lineage: expect.objectContaining({
        rulesVersion:
          "reader_summary.rules.policy.v1+summary.rules.user-preference.v1",
      }),
      contextArtifacts: [
        expect.objectContaining({
          artifactId: "summary-memory:interest:interest-reader-ai",
          summaryText:
            "User prefers risk-first summaries for runtime regressions.",
        }),
      ],
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 2,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["provider:reddit", "keyword:runtime-regression"],
      },
    });
    expect(snapshot?.topStories).toHaveLength(1);
    expect(observedMaxEvidenceItems).toBe(120);
    expect(observedThrough).toEqual(new Date("2026-06-26T08:05:00.000Z"));
    expect(snapshot?.generatedAt).toEqual(observedThrough);
    expect(snapshot?.confidence).toMatchObject({ level: "low", score: 0.42 });
    expect(
      snapshot?.confidence.rationale.match(
        /capped by the weakest published top read/gu,
      ),
    ).toHaveLength(1);
    expect(publicationPolicy.confidences).toEqual([
      snapshot?.confidence,
      snapshot?.confidence,
    ]);
    expect(model.observedPolicies()).toContainEqual(
      expect.objectContaining({
        maxOutputTokens: 16_000,
      }),
    );
    expect(model.observedGenerationPolicies()).toContainEqual({
      language: "auto",
      format: "risk_brief",
      tone: "concise",
      maxStories: 1,
      includeRisks: false,
      includeInterestHighlights: false,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      customInstructions: "Focus on runtime regressions.",
      rulesVersion:
        "reader_summary.rules.policy.v1+summary.rules.user-preference.v1",
    });
    expect(model.observedCoveragePlans()).toContainEqual({
      mode: "single_story",
      lead: expect.objectContaining({ clusterId: "cluster-1" }),
      secondary: [],
    });
    expect(events.all()).toContainEqual(
      expect.objectContaining({
        eventType: "reader_summary.ready",
        payload: expect.objectContaining({
          readerSummaryJobId: "reader-job-1",
          readerSummaryId: "reader-summary-id-1",
          period: readerSummaryPeriod,
          userId: "user-1",
          subscriptionId: "subscription-1",
        }),
      }),
    );
  });

  it("uses stable workspace preference scope for workspace reader summaries", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();
    let observedPreferenceQuery:
      | Parameters<
          UserSummaryPreferenceReaderPort["findEffectivePreference"]
        >[0]
      | undefined;

    await jobs.save(
      ReaderSummaryJob.request({
        id: "reader-job-workspace",
        tenantId: tenant,
        workspaceId: workspace,
        scope: workspaceReaderSummaryScope(),
        period: readerSummaryPeriod,
        userId: "user-1",
        idempotencyKey: "reader-job-key-workspace",
        requestedAt: new Date("2026-06-26T08:00:00.000Z"),
      }),
    );

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select() {
          return makeReaderEvidenceSelection();
        },
      },
      new CapturingReaderSummaryModel(),
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      undefined,
      {
        async findEffectivePreference(query) {
          observedPreferenceQuery = query;
          return {
            customInstructions: "Use the saved workspace summary style.",
            rulesVersion: "summary.rules.user-preference.v1",
          };
        },
      } satisfies UserSummaryPreferenceReaderPort,
      undefined,
      undefined,
      zeroEligibleGitHubProjectionReader(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-workspace",
    });

    expect(result.ok).toBe(true);
    expect(observedPreferenceQuery).toMatchObject({
      userId: "user-1",
      interestId: "00000000-0000-7000-8000-000000000903",
    });
    expect(artifacts.all()[0]?.toSnapshot().executiveSummary).toContain(
      "Use the saved workspace summary style.",
    );
  });

  it("rebuilds reader content from evidence instead of trusting model content", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();

    await jobs.save(
      ReaderSummaryJob.request({
        id: "reader-job-model-content",
        tenantId: tenant,
        workspaceId: workspace,
        scope: workspaceReaderSummaryScope(),
        period: readerSummaryPeriod,
        idempotencyKey: "reader-job-key-model-content",
        requestedAt: new Date("2026-06-26T08:00:00.000Z"),
      }),
    );

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select() {
          return makeReaderEvidenceSelection();
        },
      },
      new CapturingReaderSummaryModel({
        topReads: [{ title: "Untrusted model top read" }],
        narrativeSections: [
          {
            id: "lead",
            kind: "lead",
            title: "Overview",
            text: "Runtime regression discussion is the main signal.",
            citationIds: ["c1"],
            storyClusterId: "cluster-1",
          },
        ],
      } as unknown as ProviderReaderSummaryAttempt["draft"]["content"]),
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      undefined,
      undefined,
      emptyTopicMapBuilder(),
      undefined,
      zeroEligibleGitHubProjectionReader(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-model-content",
    });

    expect(result.ok).toBe(true);
    expect(artifacts.all()[0]?.toSnapshot().content?.topReads[0]?.title).toBe(
      "Runtime regression discussion",
    );
    expect(artifacts.all()[0]?.toSnapshot().content?.narrativeSections).toEqual(
      [
        {
          id: "lead",
          kind: "lead",
          title: "Overview",
          text: "Runtime regression discussion is the main signal.",
          citationIds: ["c1"],
          storyClusterId: "cluster-1",
        },
      ],
    );
  });

  it("rejects a generated artifact before publish when top reads fail source quality", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();

    await jobs.save(
      ReaderSummaryJob.request({
        id: "reader-job-rejected",
        tenantId: tenant,
        workspaceId: workspace,
        scope: interestReaderSummaryScope("interest-reader-ai"),
        period: readerSummaryPeriod,
        idempotencyKey: "reader-job-key-rejected",
        requestedAt: new Date("2026-06-26T08:00:00.000Z"),
      }),
    );

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select() {
          return makeReaderEvidenceSelection({
            firstContentQuality: {
              qualityScore: 0.2,
              interestRelevanceScore: 0.4,
              engagementIntegrityScore: 0.4,
              eligibleForSummary: true,
              eligibleForTopRead: false,
              needsLlmReview: true,
              decision: "downrank",
              flags: ["rumor_only"],
              reason: "Rumor-only evidence is not safe as a top read.",
            },
          });
        },
      },
      new CapturingReaderSummaryModel(),
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      undefined,
      undefined,
      throwingTopicMapBuilder(),
      undefined,
      zeroEligibleGitHubProjectionReader(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-rejected",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-job-rejected",
        status: "quality_rejected",
        readerSummaryId: "reader-summary-id-1",
      },
    });
    expect(artifacts.all()).toHaveLength(1);
    expect(artifacts.decisions()[0]).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality", "top_read_ineligible_source"],
    });
    expect(artifacts.all()[0]?.toSnapshot().confidence).toMatchObject({
      level: "low",
      score: 0,
    });
    expect(
      (
        await jobs.findById({
          tenantId: tenant,
          workspaceId: workspace,
          readerSummaryJobId: "reader-job-rejected",
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: "quality_rejected",
      readerSummaryId: "reader-summary-id-1",
      failureReason: expect.stringContaining("pre-publish quality gate"),
    });
    expect(events.all()).toEqual([]);
  });

  it("calibrates confidence before a preflight rejection and skips topic-map calls", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();
    const publicationPolicy = new CapturingReaderSummaryPublicationPolicy(
      forcedRejectionDecision(),
    );

    await jobs.save(
      ReaderSummaryJob.request({
        id: "reader-job-calibrated-rejection",
        tenantId: tenant,
        workspaceId: workspace,
        scope: interestReaderSummaryScope("interest-reader-ai"),
        period: readerSummaryPeriod,
        idempotencyKey: "reader-job-key-calibrated-rejection",
        requestedAt: new Date("2026-06-26T08:00:00.000Z"),
      }),
    );

    const result = await new ExecuteReaderSummaryJobUseCase(
      jobs,
      artifacts,
      new EmptyReaderSummaryPolicyRepository(),
      {
        async select() {
          return makeReaderEvidenceSelection();
        },
      },
      new CapturingReaderSummaryModel(),
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      undefined,
      undefined,
      throwingTopicMapBuilder(),
      publicationPolicy,
      zeroEligibleGitHubProjectionReader(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-calibrated-rejection",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: "quality_rejected" },
    });
    expect(publicationPolicy.confidences).toEqual([
      expect.objectContaining({ level: "low", score: 0.42 }),
      expect.objectContaining({ level: "low", score: 0.42 }),
    ]);
    expect(artifacts.all()[0]?.toSnapshot().confidence).toEqual(
      publicationPolicy.confidences[1],
    );
  });
});

const unused = <T>(): T => ({}) as T;

const zeroEligibleGitHubProjectionReader =
  (): ReaderSummaryGitHubProjectionReaderPort => ({
    async read() {
      return { eligibleBindingIds: [], items: [], pageCount: 1 };
    },
  });

const emptyTopicMapBuilder = (): BuildReaderSummaryTopicMapUseCase =>
  ({
    async execute() {
      return { ok: true, value: emptyReaderSummaryTopicMap() };
    },
  }) as unknown as BuildReaderSummaryTopicMapUseCase;

const throwingTopicMapBuilder = (): BuildReaderSummaryTopicMapUseCase =>
  ({
    async execute() {
      throw new Error(
        "Topic-map generation must not run for a preflight-rejected summary",
      );
    },
  }) as unknown as BuildReaderSummaryTopicMapUseCase;

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifacts: ReaderSummaryArtifact[] = [];
  private readonly publicationDecisions: ReaderSummaryPublicationDecision[] =
    [];

  async save(
    artifact: ReaderSummaryArtifact,
    options?: Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1],
  ): Promise<void> {
    this.artifacts.push(artifact);
    if (options?.publicationDecision !== undefined) {
      this.publicationDecisions.push(options.publicationDecision);
    }
  }

  async list(): Promise<
    Awaited<ReturnType<ReaderSummaryArtifactRepositoryPort["list"]>>
  > {
    return { items: this.artifacts };
  }

  async listPeriodSummaries(): Promise<ListReaderSummaryPeriodSummariesResult> {
    return { items: [] };
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return this.artifacts[0] ?? null;
  }

  async findRejectedDebugById(): Promise<null> {
    return null;
  }

  all(): readonly ReaderSummaryArtifact[] {
    return this.artifacts;
  }

  decisions(): readonly ReaderSummaryPublicationDecision[] {
    return this.publicationDecisions;
  }
}

class EmptyReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  async save(): Promise<void> {}

  async findByScope(): Promise<ReaderSummaryPolicy | null> {
    return null;
  }

  async listScheduled(): Promise<readonly ReaderSummaryPolicy[]> {
    return [];
  }
}

class CapturingSummaryEventPublisher implements SummaryEventPublisherPort {
  private readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] =
    [];

  async publish(
    event: EventEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<void> {
    this.events.push(event);
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.events;
  }
}

class CapturingReaderSummaryPublication
  implements ReaderSummaryPublicationPort
{
  constructor(
    private readonly jobs: FakeReaderSummaryJobRepository,
    private readonly artifacts: FakeReaderSummaryArtifactRepository,
    private readonly events: CapturingSummaryEventPublisher,
  ) {}

  async publish(command: ReaderSummaryPublicationCommand) {
    await this.artifacts.save(command.artifact, {
      publicationDecision: command.publicationDecision,
      githubProjectionAudit: command.githubProjectionAudit,
    });
    await this.jobs.save(command.finalJob);
    await this.events.publish(command.readyEvent);

    return "published" as const;
  }
}

class CapturingReaderSummaryPublicationPolicy extends ReaderSummaryPublicationPolicy {
  readonly confidences: ReturnType<
    ReaderSummaryArtifact["toSnapshot"]
  >["confidence"][] = [];

  constructor(
    private readonly forcedDecision?: ReaderSummaryPublicationDecision,
  ) {
    super();
  }

  override evaluate(
    params: Parameters<ReaderSummaryPublicationPolicy["evaluate"]>[0],
  ): ReaderSummaryPublicationDecision {
    this.confidences.push(params.artifact.toSnapshot().confidence);

    return this.forcedDecision ?? super.evaluate(params);
  }
}

const forcedRejectionDecision = (): ReaderSummaryPublicationDecision => ({
  status: "rejected",
  qualityPassed: false,
  canonicalScore: 0,
  shadow: {
    mode: "shadow",
    policyVersion: "reader_summary_publication_shadow_v1",
    riskScore: 0,
    signals: [],
  },
  reasonCodes: ["editorial_quality"],
  reasons: ["Forced preflight rejection for confidence regression coverage."],
  findings: [
    {
      code: "editorial_quality",
      reason: "Forced preflight rejection for confidence regression coverage.",
    },
  ],
});

class CapturingReaderSummaryModel implements ReaderSummaryModelPort {
  private readonly policies: Parameters<ReaderSummaryModelPort["route"]>[1][] =
    [];
  private readonly generationPolicies: Parameters<
    ReaderSummaryModelPort["generate"]
  >[0]["policy"][] = [];
  private readonly coveragePlans: Parameters<
    ReaderSummaryModelPort["generate"]
  >[0]["coveragePlan"][] = [];

  constructor(
    private readonly generatedContent: ProviderReaderSummaryAttempt["draft"]["content"] =
      defaultGeneratedContent(),
  ) {}

  route(
    input: Parameters<ReaderSummaryModelPort["route"]>[0],
    policy: Parameters<ReaderSummaryModelPort["route"]>[1],
  ): ReaderSummaryModelRoute {
    void input;
    this.policies.push(policy);

    return {
      provider: "deterministic-local",
      model: "capturing-reader-summary-v1",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(
    input?: Parameters<ReaderSummaryModelPort["estimate"]>[0],
    selectedRoute?: Parameters<ReaderSummaryModelPort["estimate"]>[1],
  ): ReaderSummaryModelEstimate {
    void input;
    void selectedRoute;

    return {
      inputTokens: 100,
      outputTokens: 100,
      estimatedCostUsd: 0,
    };
  }

  async generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    this.generationPolicies.push(input.policy);
    this.coveragePlans.push(input.coveragePlan);
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Test evidence must include one item and cluster");
    }

    return {
      route: selectedRoute,
      draft: {
        headline: firstItem.title,
        executiveSummary: `Custom focus: ${input.policy.customInstructions ?? "none"}`,
        topStories: [
          {
            storyClusterId: firstCluster.id,
            title: firstItem.title,
            summary: "Selected because it matches the reader preference.",
            interestIds: firstCluster.interestIds,
            providerKeys: firstCluster.providerKeys,
            citationIds: ["c1"],
          },
        ],
        interestHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: input.policy.includeRisks
          ? [
              {
                description: "Risk enabled by policy.",
                citationIds: ["c1"],
                reason: "source_limit",
              },
            ]
          : [],
        citationMap: [
          {
            citationId: "c1",
            feedItemId: firstItem.feedItemId,
            sourceItemId: firstItem.sourceItemId,
            providerKey: firstItem.providerKey,
            field: "title",
            canonicalUrl: firstItem.canonicalUrl,
          },
        ],
        qualityFlags: [],
        confidence: {
          level: "medium",
          score: 0.7,
          rationale: "Test model received selected evidence.",
        },
        lineage: {
          promptVersion: selectedRoute.promptVersion,
          schemaVersion: selectedRoute.schemaVersion,
          modelVersion: selectedRoute.model,
          providerVersion: selectedRoute.provider,
          rulesVersion: input.policy.rulesVersion,
          evalDatasetVersion: "reader_summary.eval.test.v1",
          rankingPolicyVersion: input.evidence.rankingPolicyVersion,
        },
        usage: this.estimate(input, selectedRoute),
        content: this.generatedContent,
      },
    };
  }

  validateRawProviderResponse(): ReaderSummaryModelValidationResult {
    return { ok: true };
  }

  classifyError(error: unknown): ReaderSummaryModelFailure {
    return {
      kind: "unknown",
      retryable: false,
      message: error instanceof Error ? error.message : "unknown test error",
    };
  }

  observedPolicies(): readonly Parameters<
    ReaderSummaryModelPort["route"]
  >[1][] {
    return this.policies;
  }

  observedGenerationPolicies(): readonly Parameters<
    ReaderSummaryModelPort["generate"]
  >[0]["policy"][] {
    return this.generationPolicies;
  }

  observedCoveragePlans(): readonly Parameters<
    ReaderSummaryModelPort["generate"]
  >[0]["coveragePlan"][] {
    return this.coveragePlans;
  }
}

const defaultGeneratedContent =
  (): ProviderReaderSummaryAttempt["draft"]["content"] =>
    ({
      headline: "Developers evaluate a reported runtime regression",
      narrativeSections: [
        {
          id: "narrative-test-lead",
          kind: "lead",
          title: "Main signal",
          text: "Developers are evaluating a reported runtime regression.",
          citationIds: ["c1"],
          storyClusterId: "cluster-1",
        },
      ],
    }) as unknown as ProviderReaderSummaryAttempt["draft"]["content"];

const makeReaderEvidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceSelection["selectedEvidence"][number]["contentQuality"];
  } = {},
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking.v1",
  personalization: {
    memoryGuidanceStatus: "available",
    memoryGuidanceApplied: true,
    providerPreferenceCount: 1,
    keywordPreferenceCount: 2,
    mutedKeywordCount: 0,
    blockedProviderCount: 0,
    signals: ["provider:reddit", "keyword:runtime-regression"],
  },
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-26T07:00:00.000Z"),
    endedAt: new Date("2026-06-26T08:00:00.000Z"),
    selectedFeedItemIds: ["feed-1", "feed-2"],
    storyClusterIds: ["cluster-1", "cluster-2"],
  },
  clusters: [
    {
      id: "cluster-1",
      storyKey: "runtime-regression",
      representativeFeedItemId: "feed-1",
      duplicateFeedItemIds: [],
      interestIds: ["interest-reader-ai"],
      providerKeys: ["reddit"],
      score: 2.2,
      observedAtRange: {
        startedAt: new Date("2026-06-26T07:20:00.000Z"),
        endedAt: new Date("2026-06-26T07:20:00.000Z"),
      },
      whyImportant: ["Matches user preference"],
    },
    {
      id: "cluster-2",
      storyKey: "github-release",
      representativeFeedItemId: "feed-2",
      duplicateFeedItemIds: [],
      interestIds: ["interest-reader-ai"],
      providerKeys: ["github-trending-page"],
      score: 0.9,
      observedAtRange: {
        startedAt: new Date("2026-06-26T07:30:00.000Z"),
        endedAt: new Date("2026-06-26T07:30:00.000Z"),
      },
      whyImportant: ["Strong source engagement signal"],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-1",
      sourceItemId: "reddit-post-1",
      sourceBindingId: "binding-reddit",
      interestId: "interest-reader-ai",
      providerKey: "reddit",
      providerName: "Reddit",
      canonicalUrl: "https://reddit.example.test/post-1",
      title: "Runtime regression discussion",
      bodyPreview: "Users are discussing a runtime regression.",
      publishedAt: new Date("2026-06-26T07:10:00.000Z"),
      observedAt: new Date("2026-06-26T07:20:00.000Z"),
      score: 2.2,
      whyImportant: ["Matches user preference"],
      contentQuality:
        overrides.firstContentQuality ?? eligibleReaderEvidenceQuality(),
    },
    {
      feedItemId: "feed-2",
      sourceItemId: "github-trending-1",
      sourceBindingId: "binding-github",
      interestId: "interest-reader-ai",
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      canonicalUrl: "https://github.com/example/project",
      title: "Example project trends on GitHub",
      publishedAt: new Date("2026-06-26T07:20:00.000Z"),
      observedAt: new Date("2026-06-26T07:30:00.000Z"),
      score: 0.9,
      whyImportant: ["Strong source engagement signal"],
      contentQuality: eligibleReaderEvidenceQuality(),
    },
  ],
});

const eligibleReaderEvidenceQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "keep",
  flags: [],
  reason: "Eligible reader summary evidence.",
});
