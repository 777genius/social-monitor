import {
  type EventEnvelope,
  type IdGenerator,
} from "@social-monitor/shared-kernel";

import {
  emptyReaderSummaryTopicMap,
  type ReaderSummaryArtifact,
  type ReaderSummaryPeriod,
  type ReaderSummaryPolicy,
  type ReaderSummaryPublicationDecision,
  ReaderSummaryPublicationPolicy,
} from "../../domain";
import type { BuildReaderSummaryTopicMapUseCase } from "../build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type {
  ListReaderSummaryPeriodSummariesResult,
  ProviderReaderSummaryAttempt,
  ReaderSummaryArtifactRepositoryPort,
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
} from "../../ports";
import type { FakeReaderSummaryJobRepository } from "./execute-reader-summary-job.spec-support";

export const promotionControlPeriod: ReaderSummaryPeriod = {
  cadence: "custom",
  startedAt: new Date("2026-06-26T00:00:00.000Z"),
  endedAt: new Date("2026-06-27T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "custom:2026-06-26T00:00:00.000Z:2026-06-27T00:00:00.000Z:UTC",
};

export const promotionControlDailyPeriod: ReaderSummaryPeriod = {
  ...promotionControlPeriod,
  cadence: "daily",
  periodKey: "daily:2026-06-26T00:00:00.000Z:2026-06-27T00:00:00.000Z:UTC",
};

export class PromotionControlIdGenerator implements IdGenerator {
  generate(): string {
    return "reader-summary-id-1";
  }
}

export const promotionControlEmptyTopicMapBuilder =
  (): BuildReaderSummaryTopicMapUseCase =>
    ({
      async execute() {
        return { ok: true, value: emptyReaderSummaryTopicMap() };
      },
    }) as unknown as BuildReaderSummaryTopicMapUseCase;

export const promotionControlRejectingTopicMapBuilder =
  (): BuildReaderSummaryTopicMapUseCase =>
    ({
      async execute() {
        throw new Error(
          "Topic-map generation must not run for a preflight-rejected summary",
        );
      },
    }) as unknown as BuildReaderSummaryTopicMapUseCase;

export const promotionControlZeroGitHubProjectionReader =
  (): ReaderSummaryGitHubProjectionReaderPort => ({
    async read() {
      return { eligibleBindingIds: [], items: [], pageCount: 1 };
    },
  });

export class PromotionControlArtifactRepository
  implements ReaderSummaryArtifactRepositoryPort
{
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

export class PromotionControlPolicyRepository
  implements ReaderSummaryPolicyRepositoryPort
{
  async save(): Promise<void> {}

  async findByScope(): Promise<ReaderSummaryPolicy | null> {
    return null;
  }

  async listScheduled(): Promise<readonly ReaderSummaryPolicy[]> {
    return [];
  }
}

export class PromotionControlEventPublisher
  implements SummaryEventPublisherPort
{
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

export class PromotionControlPublication implements ReaderSummaryPublicationPort {
  constructor(
    private readonly jobs: FakeReaderSummaryJobRepository,
    private readonly artifacts: PromotionControlArtifactRepository,
    private readonly events: PromotionControlEventPublisher,
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

export class PromotionControlPublicationPolicy extends ReaderSummaryPublicationPolicy {
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

export const promotionControlForcedRejection =
  (): ReaderSummaryPublicationDecision => ({
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
        reason:
          "Forced preflight rejection for confidence regression coverage.",
      },
    ],
  });

export class PromotionControlCapturingModel implements ReaderSummaryModelPort {
  private readonly generationPolicies: Parameters<
    ReaderSummaryModelPort["generate"]
  >[0]["policy"][] = [];
  private readonly evidenceIds: string[][] = [];
  private readonly evidencePayloads: string[] = [];
  private readonly contextArtifactCounts: number[] = [];

  constructor(
    private readonly generatedContent: ProviderReaderSummaryAttempt["draft"]["content"] =
      promotionControlGeneratedContent(),
  ) {}

  route(): ReaderSummaryModelRoute {
    return {
      provider: "deterministic-local",
      model: "promotion-control-capturing-v1",
      promptVersion: "reader_summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
    };
  }

  estimate(): ReaderSummaryModelEstimate {
    return { inputTokens: 100, outputTokens: 100, estimatedCostUsd: 0 };
  }

  async generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    selectedRoute: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    this.generationPolicies.push(input.policy);
    this.evidenceIds.push(
      input.evidence.selectedEvidence.map((item) => item.feedItemId),
    );
    this.evidencePayloads.push(JSON.stringify(input.evidence));
    this.contextArtifactCounts.push(input.contextArtifacts.length);
    const firstItem = input.evidence.selectedEvidence[0];
    const firstCluster = input.evidence.clusters[0];
    if (firstItem === undefined || firstCluster === undefined) {
      throw new Error("Promotion control evidence must include a lead");
    }
    return {
      route: selectedRoute,
      draft: {
        headline: firstItem.title,
        executiveSummary: "Promotion control scenario summary.",
        topStories: [
          {
            storyClusterId: firstCluster.id,
            title: firstItem.title,
            summary: "Selected by the promotion control scenario.",
            interestIds: firstCluster.interestIds,
            providerKeys: firstCluster.providerKeys,
            citationIds: ["c1"],
          },
        ],
        interestHighlights: [],
        repeatedSignals: [],
        risksAndUnknowns: [],
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
          rationale: "Promotion control test evidence was admitted.",
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
        usage: this.estimate(),
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

  observedGenerationPolicies() {
    return this.generationPolicies;
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
}

export class PromotionControlTrendingModel extends PromotionControlCapturingModel {
  override async generate(
    input: Parameters<ReaderSummaryModelPort["generate"]>[0],
    route: ReaderSummaryModelRoute,
  ): Promise<ProviderReaderSummaryAttempt> {
    const generated = await super.generate(input, route);
    const supplemental = input.evidence.selectedEvidence.filter(
      (item) => item.providerKey === "github-trending-page",
    );
    return {
      ...generated,
      draft: {
        ...generated.draft,
        citationMap: [
          ...generated.draft.citationMap,
          ...supplemental.map((item, index) => ({
            citationId: `github-citation-${index + 1}`,
            feedItemId: item.feedItemId,
            sourceItemId: item.sourceItemId,
            providerKey: item.providerKey,
            field: "canonicalUrl" as const,
            canonicalUrl: item.canonicalUrl,
          })),
        ],
      },
    };
  }
}

const promotionControlGeneratedContent =
  (): ProviderReaderSummaryAttempt["draft"]["content"] =>
    ({
      headline: "Developers evaluate a reported runtime regression",
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
    }) as unknown as ProviderReaderSummaryAttempt["draft"]["content"];
