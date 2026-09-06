import {
  type EventEnvelope,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  type ReaderSummaryArtifact,
  type ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationPolicy,
  ReaderSummaryJob,
  primaryReaderSummaryEvidence,
  type ReaderSummaryPeriod,
  type ReaderSummaryPolicy,
  interestReaderSummaryScope,
  workspaceReaderSummaryScope,
} from "../../domain";
import { presentReaderSummaryArtifact } from "../shared/reader-summary-artifact-presenter";
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
import {
  NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl,
  type ReaderSummaryPromotionAggregateMetrics,
} from "./reader-summary-promotion-control";
import { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";
import {
  makeReaderEvidenceSelection,
} from "../../test-fixtures/execute-reader-summary-job-promotion-fixtures";
import {
  promotionControlEmptyTopicMapBuilder as emptyTopicMapBuilder,
  promotionControlRejectingTopicMapBuilder as throwingTopicMapBuilder,
} from "./execute-reader-summary-job-promotion-control.spec-support";

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
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
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
    const promotionMetrics: ReaderSummaryPromotionAggregateMetrics[] = [];
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
      readerSummaryPromotionControl({
        record(value) { promotionMetrics.push(value); },
      }),
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
      undefined,
      undefined,
      undefined,
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
    expect(promotionMetrics.map((item) => item.lifecycle)).toEqual([
      "evaluated",
      "delivered",
    ]);

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
    expect(snapshot?.promotionAttestations).toHaveLength(1);
    expect(snapshot?.promotionAttestations?.[0]?.citationIds).toEqual(
      snapshot?.content?.topReads[0]?.citationIds,
    );
    expect(snapshot?.promotionAttestations?.[0]?.citationIds[0]).not.toMatch(
      /^promotion-preflight:/u,
    );
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
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
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
      undefined,
      undefined,
      undefined,
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

  it("preserves provider failure while disclosing historical limited sources", async () => {
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
        period: {
          ...readerSummaryPeriod,
          cadence: "daily",
          periodKey:
            "daily:2026-06-26T00:00:00.000Z:2026-06-27T00:00:00.000Z:UTC",
        },
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
          return primaryReaderSummaryEvidence(makeReaderEvidenceSelection());
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
      } as unknown as ProviderReaderSummaryAttempt["draft"]["content"], [
        "provider_failed",
      ]),
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-28T08:05:00.000Z")),
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      emptyTopicMapBuilder(),
      undefined,
      zeroEligibleGitHubProjectionReader(),
      {
        reason: "No timestamp-valid GitHub snapshot exists for this day.",
        authorizedAt: new Date("2026-06-28T08:05:00.000Z"),
        readerQuality: "limited_sources",
      },
      undefined,
      undefined,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-model-content",
    });

    expect(result.ok).toBe(true);
    const artifact = artifacts.all()[0] as ReaderSummaryArtifact;
    expect(
      presentReaderSummaryArtifact(artifact, {
        status: "fresh",
        checkedAt: new Date("2026-06-28T08:05:00.000Z"),
      }),
    ).toMatchObject({
      qualityFlags: ["provider_failed", "limited_sources"],
      content: {
        qualityState: {
          status: "failed_provider",
          flags: ["provider_failed", "limited_sources"],
        },
      },
    });
    expect(artifacts.audit()).toMatchObject({
      status: "not_required",
      historicalOmission: {
        mode: "github_projection_unavailable_historical",
      },
    });
    expect(artifacts.all()[0]?.toSnapshot().content?.topReads[0]?.title).toBe(
      "Runtime regression discussion\n\nUsers are discussing a runtime regression.",
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

  it("keeps ordinary zero-primary-evidence execution model-free", async () => {
    const tenant = tenantId("tenant-reader-summary-use-case");
    const workspace = workspaceId("workspace-reader-summary-use-case");
    const jobs = new FakeReaderSummaryJobRepository();
    const artifacts = new FakeReaderSummaryArtifactRepository();
    const events = new CapturingSummaryEventPublisher();
    const model = new CapturingReaderSummaryModel();

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
      model,
      new CapturingReaderSummaryPublication(jobs, artifacts, events),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-26T08:05:00.000Z")),
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      throwingTopicMapBuilder(),
      undefined,
      zeroEligibleGitHubProjectionReader(),
      undefined,
      undefined,
      undefined,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-job-rejected",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-job-rejected",
        status: "no_signal",
        readerSummaryId: "reader-summary-id-1",
      },
    });
    expect(artifacts.all()).toHaveLength(2);
    expect(artifacts.decisions()[0]).toMatchObject({
      status: "published",
    });
    expect(artifacts.all()[0]?.toSnapshot().confidence).toMatchObject({
      level: "none",
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
      status: "no_signal",
      readerSummaryId: "reader-summary-id-1",
    });
    expect(events.all()).toHaveLength(1);
    expect(events.all()[0]?.payload).toMatchObject({ status: "no_signal" });
    expect(model.generatedEvidenceIds()).toEqual([]);
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
      readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
      undefined,
      undefined,
      throwingTopicMapBuilder(),
      publicationPolicy,
      zeroEligibleGitHubProjectionReader(),
      undefined,
      undefined,
      undefined,
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

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifacts: ReaderSummaryArtifact[] = [];
  private readonly publicationDecisions: ReaderSummaryPublicationDecision[] =
    [];
  private githubProjectionAudit: unknown;

  async save(
    artifact: ReaderSummaryArtifact,
    options?: Parameters<ReaderSummaryArtifactRepositoryPort["save"]>[1],
  ): Promise<void> {
    this.artifacts.push(artifact);
    if (options?.publicationDecision !== undefined) {
      this.publicationDecisions.push(options.publicationDecision);
    }
    this.githubProjectionAudit = options?.githubProjectionAudit;
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

  audit(): unknown {
    return this.githubProjectionAudit;
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
  private readonly evidenceIds: string[][] = [];
  private readonly evidencePayloads: string[] = [];
  private readonly contextArtifactCounts: number[] = [];

  constructor(
    private readonly generatedContent: ProviderReaderSummaryAttempt["draft"]["content"] =
      defaultGeneratedContent(),
    private readonly qualityFlags: ProviderReaderSummaryAttempt["draft"]["qualityFlags"] = [],
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
    this.evidenceIds.push(input.evidence.selectedEvidence.map((item) => item.feedItemId));
    this.evidencePayloads.push(JSON.stringify(input.evidence));
    this.contextArtifactCounts.push(input.contextArtifacts.length);
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Test evidence must include one item and cluster");
    }

    return {
      route: selectedRoute,
      draft: {
        headline: "Developers evaluate a reported runtime regression",
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
        qualityFlags: this.qualityFlags,
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

  generatedEvidenceIds(): readonly (readonly string[])[] {
    return this.evidenceIds;
  }
  generatedEvidencePayloads(): readonly string[] {
    return this.evidencePayloads;
  }
  generatedContextArtifactCounts(): readonly number[] {
    return this.contextArtifactCounts;
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
