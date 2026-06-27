import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaSummaryEventPublisher } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-event.publisher";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  resolveOpenAiResponsesReaderSummaryModelOptions,
} from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-model.adapter";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { StoryRankingMetricsRecorder } from "@social-monitor/summary/adapters/metrics/story-ranking-metrics.recorder";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryPolicy,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { presentReaderSummaryArtifact } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  ReaderSummaryModelPort,
  ReserveSummaryJobQuotaCommand,
  ReserveSummaryJobQuotaResult,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import {
  CryptoIdGenerator,
  DomainError,
  ok,
  SystemClock,
  tenantId,
  workspaceId,
  type Result,
} from "@social-monitor/shared-kernel";

import { writeLiveEvidenceArtifactAtomically } from "./lib/live-evidence-artifact";

const databaseUrlEnv = "DATABASE_URL";
const evidencePathEnv = "DURABLE_READER_SUMMARY_EVIDENCE_PATH";
const frontendFixturePathEnv = "DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH";
const defaultTenantId = "11111111-1111-4111-8111-111111111111";
const defaultWorkspaceId = "22222222-2222-4222-8222-222222222222";

type FeedInventoryRow = {
  readonly providerKey: string;
  readonly itemCount: number;
  readonly newestObservedAt: string | null;
};

async function main(): Promise<void> {
  const databaseUrl = requiredEnv(databaseUrlEnv);
  const clock = new SystemClock();
  const now = clock.now();
  const tenant = tenantId(readEnv("DURABLE_READER_SUMMARY_TENANT_ID") ?? defaultTenantId);
  const workspace = workspaceId(readEnv("DURABLE_READER_SUMMARY_WORKSPACE_ID") ?? defaultWorkspaceId);
  const timezone = readEnv("DURABLE_READER_SUMMARY_TIMEZONE") ?? "UTC";
  const periodStartedAt = startOfUtcDay(now);
  const periodEndedAt = now;
  const period = buildReaderSummaryPeriod({
    cadence: "custom",
    startedAt: periodStartedAt,
    endedAt: periodEndedAt,
    timezone,
  });
  const maxEvidenceItems = readIntegerEnv("DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS", 30, 1, 50);
  const maxStories = readIntegerEnv("DURABLE_READER_SUMMARY_MAX_STORIES", 15, 1, 20);
  const modelMode = readModelMode();

  const feedConnection = new PrismaFeedConnection(databaseUrl);
  const summaryConnection = new PrismaSummaryConnection(databaseUrl);

  try {
    const feedItems = new PrismaFeedItemReadRepository(feedConnection);
    const readerSummaryJobs = new PrismaReaderSummaryJobRepository(summaryConnection);
    const readerSummaryArtifacts = new PrismaReaderSummaryArtifactRepository(summaryConnection);
    const readerSummaryPolicies = new PrismaReaderSummaryPolicyRepository(summaryConnection);
    const queue = new CapturingReaderSummaryJobQueue();
    const ids = new CryptoIdGenerator();
    const scope = { type: "workspace" } as const;

    await readerSummaryPolicies.save(
      ReaderSummaryPolicy.create({
        id: "6f3c8f05-d594-48d0-a760-1adceca4b341",
        tenantId: tenant,
        workspaceId: workspace,
        scope,
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        maxStories,
        includeRisks: true,
        includeTopicHighlights: true,
        includeRepeatedSignals: true,
        dedupeStrategy: "canonical_url_then_title",
        customInstructions:
          "Build a practical daily reader summary for AI/product/social monitoring. Prefer fresh, cited, high-signal items and clearly separate facts from risks.",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const inventoryBefore = await loadFeedInventory(summaryConnection, {
      tenantId: tenant,
      workspaceId: workspace,
      startedAt: periodStartedAt,
      endedAt: periodEndedAt,
    });

    const requestReaderSummary = new RequestReaderSummaryUseCase(
      readerSummaryJobs,
      queue,
      new AllowingSummaryQuota(clock),
      ids,
      clock,
    );
    const request = await requestReaderSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope,
      cadence: "custom",
      period: {
        startedAt: periodStartedAt,
        endedAt: periodEndedAt,
        timezone,
      },
      idempotencyKey: `durable-reader-summary:${period.periodKey}:${now.toISOString()}`,
      correlationId: `corr-durable-reader-summary-${now.getTime()}`,
    });
    if (!request.ok) {
      throw request.error;
    }

    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      clock,
    );
    const evidenceSelector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new StoryRankingMetricsRecorder(new InMemoryMetricsRecorder()),
    );
    const executeReaderSummary = new ExecuteReaderSummaryJobUseCase(
      readerSummaryJobs,
      readerSummaryArtifacts,
      readerSummaryPolicies,
      evidenceSelector,
      buildReaderSummaryModel(modelMode),
      new PrismaSummaryEventPublisher(summaryConnection),
      ids,
      clock,
    );
    const execution = await executeReaderSummary.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: request.value.readerSummaryJobId,
      maxEvidenceItems,
    });
    if (!execution.ok) {
      throw execution.error;
    }
    if (execution.value.readerSummaryId === undefined) {
      throw new Error("Durable reader summary execution did not produce an artifact id");
    }

    const artifact = await readerSummaryArtifacts.findById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryId: execution.value.readerSummaryId,
    });
    if (artifact === null) {
      throw new Error("Durable reader summary artifact was not persisted");
    }

    const frontendArtifact = presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: clock.now(),
    });
    const evidence = {
      schemaVersion: 1,
      artifactId: "durable-reader-summary-postgres-evidence-v1",
      format: "durable-reader-summary-postgres-evidence-v1",
      generatedAt: clock.now().toISOString(),
      provenance: {
        runner: "scripts/capture-durable-reader-summary-from-postgres.ts",
        fixtureOnly: false,
        database: "postgres",
        modelMode,
      },
      scope: {
        tenantId: tenant,
        workspaceId: workspace,
        summaryScope: "workspace",
      },
      period: frontendArtifact.period,
      inputInventory: inventoryBefore,
      queue: {
        capturedCommandCount: queue.all().length,
      },
      result: {
        readerSummaryJobId: execution.value.readerSummaryJobId,
        readerSummaryId: execution.value.readerSummaryId,
        status: execution.value.status,
        headline: frontendArtifact.headline,
        selectedFeedItemCount: frontendArtifact.coverage.selectedFeedItemCount,
        topReadCount: frontendArtifact.coverage.topReadCount,
        citationCount: frontendArtifact.coverage.citationCount,
        providerCount: frontendArtifact.coverage.providerCount,
        topProviderKeys: frontendArtifact.coverage.topProviderKeys,
        qualityFlags: frontendArtifact.qualityFlags,
      },
      redaction: {
        secretsIncluded: false,
        rawProviderPayloadIncluded: false,
        tokenValuesIncluded: false,
      },
    };

    writeOptionalJsonArtifact(evidencePathEnv, evidence);
    writeOptionalJsonArtifact(frontendFixturePathEnv, {
      schemaVersion: 1,
      format: "frontend-reader-summary-live-fixture-v1",
      generatedAt: clock.now().toISOString(),
      tenantId: tenant,
      workspaceId: workspace,
      userId: "durable-reader-summary-live-user",
      readerSummaryArtifact: frontendArtifact,
      evidence: evidence.result,
      redaction: evidence.redaction,
    });

    console.log(
      [
        "Durable reader summary capture OK",
        `job=${execution.value.readerSummaryJobId}`,
        `artifact=${execution.value.readerSummaryId}`,
        `status=${execution.value.status}`,
        `selected=${frontendArtifact.coverage.selectedFeedItemCount}`,
        `topReads=${frontendArtifact.coverage.topReadCount}`,
        `providers=${frontendArtifact.coverage.topProviderKeys.join(",")}`,
        `headline=${frontendArtifact.headline}`,
      ].join("\n"),
    );
  } finally {
    await Promise.all([feedConnection.close(), summaryConnection.close()]);
  }
}

class CapturingReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  constructor(private readonly clock: SystemClock) {}

  async reserveSummaryJob(
    _command: ReserveSummaryJobQuotaCommand,
  ): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    return ok({
      remaining: 999,
      resetAt: new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }
}

const buildReaderSummaryModel = (
  mode: "deterministic" | "openai-responses",
): ReaderSummaryModelPort => {
  if (mode === "deterministic") {
    return new DeterministicReaderSummaryModelAdapter();
  }

  return new OpenAiResponsesReaderSummaryModelAdapter(
    resolveOpenAiResponsesReaderSummaryModelOptions(process.env, {
      requireApiKey: true,
    }),
  );
};

const loadFeedInventory = async (
  prisma: PrismaSummaryConnection,
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly startedAt: Date;
    readonly endedAt: Date;
  },
): Promise<readonly FeedInventoryRow[]> => {
  const rows = await prisma.$queryRaw<
    {
      provider_key: string;
      item_count: bigint;
      newest_observed_at: Date | null;
    }[]
  >`
    select provider_key, count(*) as item_count, max(observed_at) as newest_observed_at
    from feed_items
    where tenant_id = ${params.tenantId}
      and workspace_id = ${params.workspaceId}
      and status = 'VISIBLE'
      and observed_at >= ${params.startedAt}
      and observed_at < ${params.endedAt}
    group by provider_key
    order by provider_key asc
  `;

  return rows.map((row) => ({
    providerKey: row.provider_key,
    itemCount: Number(row.item_count),
    newestObservedAt: row.newest_observed_at?.toISOString() ?? null,
  }));
};

const writeOptionalJsonArtifact = (
  envName: string,
  value: unknown,
): void => {
  const artifactPath = readEnv(envName);
  if (artifactPath === undefined) {
    return;
  }

  mkdirSync(dirname(artifactPath), { recursive: true });
  writeLiveEvidenceArtifactAtomically(
    artifactPath,
    `${JSON.stringify(value, null, 2)}\n`,
    envName,
  );
};

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const readModelMode = (): "deterministic" | "openai-responses" => {
  const value = readEnv("DURABLE_READER_SUMMARY_MODEL") ?? "openai-responses";
  if (value === "deterministic" || value === "openai-responses") {
    return value;
  }

  throw new Error("DURABLE_READER_SUMMARY_MODEL must be deterministic or openai-responses");
};

const readIntegerEnv = (
  name: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
};

const requiredEnv = (name: string): string => {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Durable reader summary capture failed: ${message}`);
  process.exitCode = 1;
});
