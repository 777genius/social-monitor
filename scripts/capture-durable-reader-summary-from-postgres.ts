import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { resolvePostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import {
  AgentRuntimeReaderSummaryModelAdapter,
  resolveAgentRuntimeReaderSummaryModelOptions,
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-model.adapter";
import {
  AgentRuntimeReaderSummaryTopicLabeler,
  resolveAgentRuntimeReaderSummaryTopicLabelerOptions,
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-labeler.adapter";
import {
  AgentRuntimeReaderSummaryTopicRelationVerifier,
  resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "@social-monitor/summary/adapters/model/agent-runtime-reader-summary-topic-relation-verifier.adapter";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import {
  OpenAiResponsesReaderSummaryModelAdapter,
  resolveOpenAiResponsesReaderSummaryModelOptions,
} from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-model.adapter";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import {
  buildReaderSummaryPeriod,
  ReaderSummaryPolicy,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { presentReaderSummaryArtifact } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryTimestampPolicy,
  ReaderSummaryJobQueuePort,
  ReaderSummaryModelPort,
  ReaderSummaryTopicMapPublicationAuditPort,
  ReaderSummaryTopicMapPublicationRejection,
  ReserveSummaryJobQuotaCommand,
  ReserveSummaryJobQuotaResult,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import {
  CryptoIdGenerator,
  ok,
  SystemClock,
  tenantId,
  workspaceId,
  type DomainError,
  type Result,
  type Clock,
} from "@social-monitor/shared-kernel";

import { loadDotenvIfPresent } from "./lib/env-file";
import { writeLiveEvidenceArtifactAtomically } from "./lib/live-evidence-artifact";
import { DurableReaderSummaryExecutionAttestationCapture } from "./lib/reader-summary-execution-attestation-capture";
import {
  HistoricalGitHubOmissionEvidenceSelector,
  resolveHistoricalGitHubOmission,
} from "./lib/reader-summary-historical-github-omission";
import {
  DatasetGuardedReaderSummaryEvidenceSelector,
  ReaderSummaryDayDatasetGuard,
  readReaderSummaryDayDatasetManifest,
} from "./lib/reader-summary-day-dataset-guard";
import { assertImmutableRecoveryInputs } from "./lib/reader-summary-recovery-files";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import {
  createReaderSummaryDailyCaptureContext,
} from "./lib/reader-summary-daily-publication-finalizer";
import { createReaderSummaryDailyCapturePublicationWiring } from
  "./lib/reader-summary-daily-story-relation-verifier";
import {
  readerSummaryProductionDayAttemptIdentity,
  readerSummaryProductionDayIdempotencyKey,
  type ReaderSummaryProductionDayAttemptIdentityInput,
} from "./lib/reader-summary-production-day-attempt-identity";
import {
  readerSummaryServingAuthorityRequiresAgentRuntime,
  resolveReaderSummaryServingAuthority,
} from "./lib/reader-summary-serving-authority";
import {
  addUtcDays,
  liveObservationCutoffEnv,
  resolveLiveObservationCutoff,
  resolveRecoveryTimestampPolicy,
  startOfUtcDay,
} from "./lib/reader-summary-capture-period-policy";
import {
  assertReaderSummaryDbPublicationFailpointInactive,
  createRecoverableReaderSummaryPublication,
} from "./lib/reader-summary-db-publication-reconciliation";
import {
  assertProductionDayPromotionRetrySafe,
  resolveProductionDayPromotionRebuild,
} from "./lib/reader-summary-production-day-promotion-rebuild";

const databaseUrlEnv = "DATABASE_URL";
const evidencePathEnv = "DURABLE_READER_SUMMARY_EVIDENCE_PATH";
const frontendFixturePathEnv = "DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH";
const rejectedTopicMapPathEnv =
  "DURABLE_READER_SUMMARY_REJECTED_TOPIC_MAP_PATH";
const defaultTenantId = "11111111-1111-4111-8111-111111111111";
const defaultWorkspaceId = "22222222-2222-4222-8222-222222222222";
const periodStartedAtEnv = "DURABLE_READER_SUMMARY_PERIOD_STARTED_AT";
const periodEndedAtEnv = "DURABLE_READER_SUMMARY_PERIOD_ENDED_AT";
const cadenceEnv = "DURABLE_READER_SUMMARY_CADENCE";
const historicalGitHubOmissionReasonEnv =
  "DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON";
const datasetManifestPathEnv = "DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH";
const datasetManifestSha256Env =
  "DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256";
const sourceReportSha256Env =
  "DURABLE_READER_SUMMARY_SOURCE_REPORT_SHA256";
const collectionArtifactSha256Env =
  "DURABLE_READER_SUMMARY_COLLECTION_ARTIFACT_SHA256";
const collectionQualityReportSha256Env =
  "DURABLE_READER_SUMMARY_COLLECTION_QUALITY_REPORT_SHA256";
const datasetRecoveryRootEnv = "DURABLE_READER_SUMMARY_RECOVERY_ROOT";
const recoveryTimestampPolicyEnv =
  "DURABLE_READER_SUMMARY_RECOVERY_TIMESTAMP_POLICY";
const publicationRecoveryDirectoryEnv =
  "DURABLE_READER_SUMMARY_PUBLICATION_RECOVERY_DIR";
loadDotenvIfPresent(".env");
type DurableReaderSummaryModelMode =
  "deterministic" | "openai-responses" | "agent-runtime";
type DurableReaderSummaryTopicLabelerMode = "deterministic" | "agent-runtime";
type DurableReaderSummaryCadence = "daily" | "weekly" | "monthly" | "custom";

type FeedInventoryRow = {
  readonly providerKey: string;
  readonly itemCount: number;
  readonly newestObservedAt: string | null;
};

async function main(): Promise<void> {
  const databaseUrl = requiredEnv(databaseUrlEnv);
  const { dailyReplay, operationalClock: clock } =
    createReaderSummaryDailyCaptureContext({
      env: process.env,
      operationalClock: new SystemClock(),
    });
  const now = clock.now();
  const tenant = tenantId(
    readEnv("DURABLE_READER_SUMMARY_TENANT_ID") ?? defaultTenantId,
  );
  const workspace = workspaceId(
    readEnv("DURABLE_READER_SUMMARY_WORKSPACE_ID") ?? defaultWorkspaceId,
  );
  const timezone = readEnv("DURABLE_READER_SUMMARY_TIMEZONE") ?? "UTC";
  const cadence = readCadence();
  const periodStartedAt = readDateEnv(periodStartedAtEnv) ?? startOfUtcDay(now);
  const periodEndedAt =
    readDateEnv(periodEndedAtEnv) ??
    (cadence === "daily" ? addUtcDays(periodStartedAt, 1) : now);
  const period = buildReaderSummaryPeriod({
    cadence,
    startedAt: periodStartedAt,
    endedAt: periodEndedAt,
    timezone,
  });
  const recoveryTimestampPolicy = resolveRecoveryTimestampPolicy({
    argv: process.argv.slice(2),
    envValue: readEnv(recoveryTimestampPolicyEnv),
    cadence,
    timezone,
    periodStartedAt,
    periodEndedAt,
    now,
  });
  const historicalGitHubOmission = resolveHistoricalGitHubOmission({
    argv: process.argv.slice(2),
    reason: readEnv(historicalGitHubOmissionReasonEnv),
    cadence,
    timezone,
    periodStartedAt,
    periodEndedAt,
    now,
  });
  if (
    historicalGitHubOmission !== undefined &&
    !recoveryTimestampPolicy.active
  ) {
    throw new Error(
      "Historical GitHub omission requires explicit historical recovery mode",
    );
  }
  const liveObservationCutoff = resolveLiveObservationCutoff({
    value: readDateEnv(liveObservationCutoffEnv),
    dailyReplayActive: dailyReplay !== null,
    recoveryActive: recoveryTimestampPolicy.active,
    cadence,
    timezone,
    periodStartedAt,
    periodEndedAt,
    now,
  });
  const promotionRebuild = resolveProductionDayPromotionRebuild({
    env: process.env,
    recoveryActive: recoveryTimestampPolicy.active,
    date: periodStartedAt.toISOString().slice(0, 10),
  });
  const sourceProvenance: ReaderSummaryProductionDayAttemptIdentityInput["sourceProvenance"] =
    dailyReplay !== null
      ? {
          kind: "persisted-daily-replay",
          sourceAuthoritySha256: dailyReplay.authoritySha256,
          originalModelJobIdentity: dailyReplay.modelJobIdentity,
          originalReceiptSha256: sha256Bytes(dailyReplay.receiptBytes),
        }
      : recoveryTimestampPolicy.active
        ? {
            kind: "historical-regeneration",
            sourceReportSha256: requiredEnv(sourceReportSha256Env),
            collectionArtifactSha256: requiredEnv(collectionArtifactSha256Env),
            collectionQualityReportSha256: requiredEnv(
              collectionQualityReportSha256Env,
            ),
            datasetManifestSha256: requiredEnv(datasetManifestSha256Env),
            timestampPolicy: recoveryTimestampPolicy.policy,
            ...(promotionRebuild === undefined
              ? {}
              : { promotionRebuild }),
            ...(historicalGitHubOmission === undefined
              ? {}
              : {
                  historicalGitHubOmissionReason:
                    historicalGitHubOmission.reason,
                }),
          }
        : {
            kind: "live-production",
            ...(liveObservationCutoff === undefined
              ? {}
              : { observationCutoff: liveObservationCutoff.toISOString() }),
          };
  const maxEvidenceItems = readIntegerEnv(
    "DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS",
    200,
    1,
    200,
  );
  const maxStories = readIntegerEnv(
    "DURABLE_READER_SUMMARY_MAX_STORIES",
    15,
    1,
    20,
  );
  const modelMode = readModelMode();
  const topicLabelerMode = readTopicLabelerMode();
  const agentRuntimeClient =
    readerSummaryServingAuthorityRequiresAgentRuntime({
      summaryModelMode: modelMode,
      topicLabelerMode,
    })
      ? buildAgentRuntimeClient()
      : null;
  const executionAttestations =
    new DurableReaderSummaryExecutionAttestationCapture();

  const runtimePoolConfig = resolvePostgresRuntimePoolConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    POSTGRES_RUNTIME_PROCESS: "daily-runner",
    POSTGRES_RUNTIME_POOL_MIN: process.env.POSTGRES_RUNTIME_POOL_MIN ?? "0",
    POSTGRES_RUNTIME_POOL_MAX: process.env.POSTGRES_RUNTIME_POOL_MAX ?? "2",
  });
  const feedConnection = await PrismaFeedConnection.create(runtimePoolConfig);
  const summaryConnection =
    await PrismaSummaryConnection.create(runtimePoolConfig);

  try {
    const datasetGuard = recoveryTimestampPolicy.active
      ? buildDatasetGuard({
          client: summaryConnection,
          clock,
          tenantId: tenant,
          workspaceId: workspace,
          periodStartedAt,
          periodEndedAt,
          now,
          timestampPolicy: recoveryTimestampPolicy.policy,
        })
      : null;
    const feedItems = new PrismaFeedItemReadRepository(feedConnection);
    const readerSummaryJobs = new PrismaReaderSummaryJobRepository(
      summaryConnection,
    );
    const readerSummaryArtifacts = new PrismaReaderSummaryArtifactRepository(
      summaryConnection,
    );
    const readerSummaryPolicies = new PrismaReaderSummaryPolicyRepository(
      summaryConnection,
    );
    const publicationWiring =
      createReaderSummaryDailyCapturePublicationWiring({
        replay: dailyReplay,
        feedItems,
        summaryClient: summaryConnection,
        clock,
        attestationSink: executionAttestations,
        summaryModelMode: modelMode,
        env: process.env,
        agentRuntimeClient,
      });
    const queue = new CapturingReaderSummaryJobQueue();
    const ids = new CryptoIdGenerator();
    const scope = { type: "workspace" } as const;

    await readerSummaryPolicies.save(
      ReaderSummaryPolicy.create({
        id: deterministicUuid(
          ["reader-summary-policy", tenant, workspace, scope.type].join(":"),
        ),
        tenantId: tenant,
        workspaceId: workspace,
        scope,
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        maxStories,
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        dedupeStrategy: "canonical_url_then_title",
        customInstructions:
          "Build a practical daily reader summary for AI/product/social monitoring. Prefer fresh, cited, high-signal items and clearly separate facts from risks.",
        createdAt: now,
        updatedAt: now,
      }),
    );

    const inventoryBefore = dailyReplay === null
      ? await loadFeedInventory(summaryConnection, {
          tenantId: tenant,
          workspaceId: workspace,
          startedAt: periodStartedAt,
          endedAt: periodEndedAt,
          timestampPolicy: recoveryTimestampPolicy.policy,
        })
      : publicationWiring.inventory!;

    const servingAuthority = await resolveReaderSummaryServingAuthority({
      summaryModelMode: modelMode,
      topicLabelerMode,
      env: process.env,
      agentRuntimeClient,
      checkedAt: clock.now().toISOString(),
    });
    const attemptIdentity = readerSummaryProductionDayAttemptIdentity({
      tenantId: tenant,
      workspaceId: workspace,
      periodKey: period.periodKey,
      servingAuthority,
      sourceProvenance,
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
      cadence,
      period: {
        startedAt: periodStartedAt,
        endedAt: periodEndedAt,
        timezone,
      },
      idempotencyKey: readerSummaryProductionDayIdempotencyKey(
        attemptIdentity,
        promotionRebuild?.rebuildIdentity,
      ),
      correlationId: `corr-durable-reader-summary-${now.getTime()}`,
    });
    if (!request.ok) {
      throw request.error;
    }
    if (promotionRebuild !== undefined) {
      assertProductionDayPromotionRetrySafe(request.value);
    }

    const relevanceEvidenceSelector = publicationWiring.evidenceSelector;
    const omissionAwareEvidenceSelector =
      historicalGitHubOmission === undefined
        ? relevanceEvidenceSelector
        : new HistoricalGitHubOmissionEvidenceSelector(
            relevanceEvidenceSelector,
          );
    const evidenceSelector =
      datasetGuard === null
        ? omissionAwareEvidenceSelector
        : new DatasetGuardedReaderSummaryEvidenceSelector(
            omissionAwareEvidenceSelector,
            datasetGuard,
          );
    const durablePublication = new PrismaReaderSummaryPublication(
      summaryConnection,
      datasetGuard === null
        ? undefined
        : (transactionClient) =>
            datasetGuard.assertCurrentForPublicationTransaction(
              transactionClient,
            ),
    );
    const { publication, recovery: publicationRecovery } =
      createRecoverableReaderSummaryPublication({
        delegate: durablePublication,
        recoveryDirectory: readEnv(publicationRecoveryDirectoryEnv),
        attemptIdentity,
        attestations: () => executionAttestations.all(),
      });
    const metrics = new InMemoryMetricsRecorder();
    const executeReaderSummary = new ExecuteReaderSummaryJobUseCase(
      readerSummaryJobs,
      readerSummaryArtifacts,
      readerSummaryPolicies,
      evidenceSelector,
      publicationWiring.model ?? buildReaderSummaryModel(
        modelMode,
        agentRuntimeClient,
        executionAttestations,
      ),
      publication,
      ids,
      clock,
      readerSummaryPromotionControl(
        new ReaderSummaryPromotionMetricsRecorder(metrics),
      ),
      undefined,
      undefined,
      publicationWiring.topicMapBuilder ?? buildTopicMapBuilder(
        topicLabelerMode,
        agentRuntimeClient,
        executionAttestations,
      ),
      undefined,
      publicationWiring.githubProjectionReader,
      historicalGitHubOmission,
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
      throw new Error(
        "Durable reader summary execution did not produce an artifact id",
      );
    }
    assertReaderSummaryDbPublicationFailpointInactive(
      readEnv("READER_SUMMARY_DAILY_RUN_FAILPOINT"),
    );

    const persistedJob = await readerSummaryJobs.findById({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: execution.value.readerSummaryJobId,
    });
    if (persistedJob === null) {
      throw new Error("Durable reader summary job was not persisted");
    }
    const persistedJobSnapshot = persistedJob.toSnapshot();
    if (
      persistedJobSnapshot.status !== execution.value.status ||
      persistedJobSnapshot.readerSummaryId !== execution.value.readerSummaryId
    ) {
      throw new Error(
        "Durable reader summary job and execution result are inconsistent",
      );
    }
    if (execution.value.status === "quality_rejected") {
      const rejectedArtifact =
        await readerSummaryArtifacts.findRejectedDebugById({
          tenantId: tenant,
          workspaceId: workspace,
          readerSummaryId: execution.value.readerSummaryId,
        });
      if (rejectedArtifact === null) {
        throw new Error(
          "Durable reader summary quality-rejected artifact was not persisted",
        );
      }
      throw new Error(
        `Durable reader summary failed publication quality: ${persistedJobSnapshot.failureReason ?? "unknown quality rejection"}`,
      );
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
    const executionAttestationRecords =
      publicationRecovery === null
        ? executionAttestations.all()
        : publicationRecovery.load({
            tenantId: tenant,
            workspaceId: workspace,
            periodKey: period.periodKey,
            readerSummaryJobId: execution.value.readerSummaryJobId,
            readerSummaryArtifactId: execution.value.readerSummaryId,
          });
    const durableReadback = {
      summaryContentSha256: canonicalJsonSha256(frontendArtifact.content),
      topicMapSha256: canonicalJsonSha256(frontendArtifact.content.topicMap),
      executionAttestationSetSha256: canonicalJsonSha256(
        executionAttestationRecords,
      ),
    };
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
        servingAuthority,
        productionDayAttempt: {
          schemaVersion: 1,
          identity: attemptIdentity,
          requestCreated: request.value.created,
          reconciledFromDbPublication: !request.value.created,
          ...(promotionRebuild === undefined
            ? {}
            : {
                promotionRebuildIdentity: promotionRebuild.rebuildIdentity,
                authoritativeInputDigest:
                  promotionRebuild.authoritativeInputDigest,
                promotionPolicyVersion: promotionRebuild.policyVersion,
              }),
        },
        historicalGitHubOmission:
          historicalGitHubOmission === undefined
            ? undefined
            : {
                mode: "github_projection_unavailable_historical",
                reason: historicalGitHubOmission.reason,
                authorizedAt:
                  historicalGitHubOmission.authorizedAt.toISOString(),
              },
        datasetManifest: datasetGuard?.evidence(),
        dailySourceAuthority:
          dailyReplay === null
            ? undefined
            : {
                schemaVersion: 1,
                canonicalSha256: dailyReplay.authoritySha256,
                modelJobIdentity: dailyReplay.modelJobIdentity,
                receiptSha256: sha256Bytes(dailyReplay.receiptBytes),
                modelExecution: dailyReplay.modelTelemetry,
              },
      },
      scope: {
        tenantId: tenant,
        workspaceId: workspace,
        summaryScope: "workspace",
      },
      period: frontendArtifact.period,
      inputInventory: inventoryBefore,
      inputInventoryTimestampPolicy: recoveryTimestampPolicy.policy,
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
      executionAttestations: executionAttestationRecords,
      durableReadback,
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

function buildDatasetGuard(params: {
  readonly client: PrismaSummaryConnection;
  readonly clock: Clock;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly now: Date;
  readonly timestampPolicy: ReaderSummaryTimestampPolicy;
}): ReaderSummaryDayDatasetGuard {
  const manifestPath = requiredEnv(datasetManifestPathEnv);
  assertImmutableRecoveryInputs({
    recoveryRoot: requiredEnv(datasetRecoveryRootEnv),
    inputPaths: [manifestPath],
    forbiddenOutputPaths: [],
  });
  const { manifest, fileSha256 } = readReaderSummaryDayDatasetManifest({
    path: manifestPath,
    expectedFileSha256: requiredEnv(datasetManifestSha256Env),
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    startedAt: params.periodStartedAt,
    endedAt: params.periodEndedAt,
    now: params.now,
    expectedTimestampPolicy: params.timestampPolicy,
  });
  return new ReaderSummaryDayDatasetGuard(
    params.client,
    manifest,
    fileSha256,
    () => params.clock.now(),
  );
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
  constructor(private readonly clock: Clock) {}

  async reserveSummaryJob(
    _command: ReserveSummaryJobQuotaCommand,
  ): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    void _command;

    return ok({
      remaining: 999,
      resetAt: new Date(
        this.clock.now().getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
  }
}

const buildReaderSummaryModel = (
  mode: DurableReaderSummaryModelMode,
  agentRuntimeClient: GrpcAgentRuntimeClient | null,
  executionAttestations: DurableReaderSummaryExecutionAttestationCapture,
): ReaderSummaryModelPort => {
  if (mode === "deterministic") {
    return new DeterministicReaderSummaryModelAdapter();
  }

  if (mode === "agent-runtime") {
    return new AgentRuntimeReaderSummaryModelAdapter({
      ...resolveAgentRuntimeReaderSummaryModelOptions(
        process.env,
        requireAgentRuntimeClient(agentRuntimeClient),
      ),
      verifiedAttestationSink: executionAttestations,
    });
  }

  return new OpenAiResponsesReaderSummaryModelAdapter(
    resolveOpenAiResponsesReaderSummaryModelOptions(process.env, {
      requireApiKey: true,
    }),
  );
};

const buildTopicMapBuilder = (
  mode: DurableReaderSummaryTopicLabelerMode,
  agentRuntimeClient: GrpcAgentRuntimeClient | null,
  executionAttestations: DurableReaderSummaryExecutionAttestationCapture,
): BuildReaderSummaryTopicMapUseCase => {
  const publicationAudit = buildTopicMapPublicationAudit();

  return mode === "agent-runtime"
    ? new BuildReaderSummaryTopicMapUseCase({
        mode: "agent-runtime",
        publicationAudit,
        labeler: new AgentRuntimeReaderSummaryTopicLabeler({
          ...resolveAgentRuntimeReaderSummaryTopicLabelerOptions(
            process.env,
            requireAgentRuntimeClient(agentRuntimeClient),
          ),
          verifiedAttestationSink: executionAttestations,
        }),
        relationVerifier: new AgentRuntimeReaderSummaryTopicRelationVerifier({
          ...resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions(
            process.env,
            requireAgentRuntimeClient(agentRuntimeClient),
          ),
          verifiedAttestationSink: executionAttestations,
        }),
      })
    : new BuildReaderSummaryTopicMapUseCase({ publicationAudit });
};

const buildTopicMapPublicationAudit =
  (): ReaderSummaryTopicMapPublicationAuditPort | null => {
    const path = readEnv(rejectedTopicMapPathEnv);

    return path === undefined ? null : new FileTopicMapPublicationAudit(path);
  };

class FileTopicMapPublicationAudit implements ReaderSummaryTopicMapPublicationAuditPort {
  constructor(private readonly path: string) {}

  async recordRejectedCandidate(
    rejection: ReaderSummaryTopicMapPublicationRejection,
  ): Promise<void> {
    writeLiveEvidenceArtifactAtomically(
      this.path,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          format: "reader-summary-topic-map-publication-rejection-v1",
          generatedAt: new Date().toISOString(),
          minimumGroupedCoverage: rejection.minimumGroupedCoverage,
          attemptNumber: rejection.attemptNumber,
          totalAttempts: rejection.totalAttempts,
          willRetry: rejection.willRetry,
          retryReason: rejection.retryReason,
          structureQuality: rejection.structureQuality,
          topicMap: rejection.topicMap,
          redaction: {
            secretsIncluded: false,
            rawProviderPayloadIncluded: false,
            tokenValuesIncluded: false,
          },
        },
        null,
        2,
      )}\n`,
      rejectedTopicMapPathEnv,
    );
  }
}

const buildAgentRuntimeClient = (): GrpcAgentRuntimeClient =>
  GrpcAgentRuntimeClient.connect({
    address: requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
    clock: new SystemClock(),
    options: {
      timeoutMs: readIntegerEnv(
        "AGENT_RUNTIME_GRPC_TIMEOUT_MS",
        5_000,
        1,
        600_000,
      ),
      serviceToken: readEnv("AGENT_RUNTIME_SERVICE_TOKEN"),
    },
  });

const requireAgentRuntimeClient = (
  client: GrpcAgentRuntimeClient | null,
): GrpcAgentRuntimeClient => {
  if (client === null) {
    throw new Error("AGENT_RUNTIME_GRPC_ADDRESS is required for agent-runtime");
  }

  return client;
};

const loadFeedInventory = async (
  prisma: PrismaSummaryConnection,
  params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly startedAt: Date;
    readonly endedAt: Date;
    readonly timestampPolicy: ReaderSummaryTimestampPolicy;
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
      and case ${params.timestampPolicy}
        when 'published_at' then published_at
        when 'observed_at' then observed_at
        else null
      end >= ${params.startedAt}
      and case ${params.timestampPolicy}
        when 'published_at' then published_at
        when 'observed_at' then observed_at
        else null
      end < ${params.endedAt}
    group by provider_key
    order by provider_key asc
  `;

  return rows.map((row) => ({
    providerKey: row.provider_key,
    itemCount: Number(row.item_count),
    newestObservedAt: row.newest_observed_at?.toISOString() ?? null,
  }));
};

const writeOptionalJsonArtifact = (envName: string, value: unknown): void => {
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

const readCadence = (): DurableReaderSummaryCadence => {
  const value = readEnv(cadenceEnv) ?? "custom";
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "custom"
  ) {
    return value;
  }

  throw new Error(`${cadenceEnv} must be daily, weekly, monthly or custom`);
};

const readDateEnv = (name: string): Date | undefined => {
  const value = readEnv(name);
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be an ISO date-time`);
  }

  return date;
};

const readModelMode = (): DurableReaderSummaryModelMode => {
  const value = readEnv("DURABLE_READER_SUMMARY_MODEL") ?? "agent-runtime";
  if (
    value === "deterministic" ||
    value === "openai-responses" ||
    value === "agent-runtime"
  ) {
    return value;
  }

  throw new Error(
    "DURABLE_READER_SUMMARY_MODEL must be deterministic, openai-responses or agent-runtime",
  );
};

const readTopicLabelerMode = (): DurableReaderSummaryTopicLabelerMode => {
  const value =
    readEnv("DURABLE_READER_SUMMARY_TOPIC_LABELER") ?? "agent-runtime";
  if (value === "deterministic" || value === "agent-runtime") {
    return value;
  }

  throw new Error(
    "DURABLE_READER_SUMMARY_TOPIC_LABELER must be deterministic or agent-runtime",
  );
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

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest(),
  ).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

const sha256Bytes = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Durable reader summary capture failed: ${message}`);
  process.exitCode = 1;
});
