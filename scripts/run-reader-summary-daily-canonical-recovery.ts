import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { ReaderSummaryPolicy } from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { presentReaderSummaryArtifact } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryJobQueuePort,
  ReaderSummaryModelPort,
  ReaderSummaryPolicyRepositoryPort,
  ReserveSummaryJobQuotaCommand,
  ReserveSummaryJobQuotaResult,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import {
  ok,
  SystemClock,
  tenantId,
  workspaceId,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
} from "@social-monitor/shared-kernel";

import { PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization";
import { loadDotenvIfPresent } from "./lib/env-file";
import { GrpcReaderSummaryDailyCanonicalRecoveryRuntime } from "./lib/grpc-reader-summary-daily-subscription-runtime";
import { DurableReaderSummaryExecutionAttestationCapture } from "./lib/reader-summary-execution-attestation-capture";
import {
  createReaderSummaryDailyPublicationExecutionWiring,
  type ReaderSummaryDailyReplayInput,
} from "./lib/reader-summary-daily-publication-finalizer";
import {
  isReaderSummaryDailySourceAuthorityV2,
  verifyReaderSummaryDailySourceAuthority,
  type VerifiedReaderSummaryDailySourceAuthority,
} from "./lib/reader-summary-daily-source-authority-snapshot";
import {
  PostgresCanonicalRecoveryAuthority,
  canonicalJsonBytes,
  sha256,
  type CanonicalRecoveryFinalizer,
} from "./lib/reader-summary-daily-canonical-recovery-v4";
import { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./lib/reader-summary-daily-canonical-recovery-v4-executor";
import {
  createReaderSummaryDailyTerminalRuntimeConnection,
  readerSummaryDailyTerminalRole,
} from "./lib/reader-summary-daily-terminal-runtime-connection";

if (process.argv[1] !== undefined && resolve(process.argv[1]) === __filename) {
  void Promise.resolve().then(() => {
    loadDotenvIfPresent(".env");
    return main();
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const recoveryTenantId = required("READER_SUMMARY_DAILY_TENANT_ID");
  const recoveryWorkspaceId = required("READER_SUMMARY_DAILY_WORKSPACE_ID");
  const publicationDatabaseUrl = requiredSystemDatabaseUrl();
  const terminalDatabaseUrl =
    deriveReaderSummaryDailyTerminalDatabaseUrl(publicationDatabaseUrl);
  const publicDirectory = resolve(required("READER_SUMMARY_DAILY_PUBLIC_DIRECTORY"));
  const runtimeConnection = createReaderSummaryDailyTerminalRuntimeConnection({
    READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL: terminalDatabaseUrl,
    READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL: publicationDatabaseUrl,
  });
  const prisma = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(publicationDatabaseUrl, "daily-runner"),
  );
  const runtimeClient = GrpcAgentRuntimeClient.connect({
    address: required("AGENT_RUNTIME_GRPC_ADDRESS"),
    clock: new SystemClock(),
    options: {
      timeoutMs: positive(process.env.AGENT_RUNTIME_GRPC_TIMEOUT_MS, 5_000),
      serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN?.trim() || undefined,
    },
  });
  try {
    const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
      authority: new PostgresCanonicalRecoveryAuthority(runtimeConnection.terminal),
      runtime: new GrpcReaderSummaryDailyCanonicalRecoveryRuntime(runtimeClient),
      finalizer: createReaderSummaryDailyCanonicalRecoveryV4Finalizer({
        prisma,
        publicDirectory,
      }),
      now: () => new Date(),
    });
    const outcome = await executor.runAll({
      tenantId: recoveryTenantId,
      workspaceId: recoveryWorkspaceId,
      workerId: `daily-canonical-recovery-v4-${randomUUID()}`,
    });
    console.log(`reader-summary-daily-canonical-recovery-v4 outcome=${outcome.kind}`);
    if (outcome.kind === "caught_up") {
      console.log(`finalized_dates=${outcome.publications.length}`);
    }
  } finally {
    await Promise.all([runtimeConnection.close(), prisma.close()]);
  }
}

/**
 * The production runner and the disposable PostgreSQL 18 contract share the
 * exact Prisma -> use case -> prepublication -> fenced publication path.
 * The contract injects only a deterministic subscription response; it never
 * emulates a repository, publication, or V4 transition in memory.
 */
export const createReaderSummaryDailyCanonicalRecoveryV4Finalizer = (dependencies: {
  readonly prisma: PrismaSummaryConnection;
  readonly publicDirectory: string;
}): CanonicalRecoveryFinalizer => {
  const atomic = new PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization(
    dependencies.prisma,
    capture,
    (input, publication) => stageReaderSummaryDailyCanonicalRecoveryPublicFiles(
      dependencies.publicDirectory,
      input.work.modelJobIdentity,
      input.work.requestedUtcDate,
      publication,
    ),
  );
  return { finalize: (input) => atomic.finalize(input) };
};

const capture = async (
  input: Parameters<CanonicalRecoveryFinalizer["finalize"]>[0],
  transaction: PrismaReaderSummaryClient,
) => {
  const completedAt = exactText(input.work.completedAt, "DB completion time");
  const operationClock: Clock = { now: () => new Date(completedAt) };
  const executionAttestations = new DurableReaderSummaryExecutionAttestationCapture();
  const replay = replayInput(input);
  const frozenObservedThrough = createFrozenObservedThroughExecution({
    completedAt,
    ingestionCutoff: replay.ingestionCutoff,
  });
  const prisma = canonicalRecoveryPrismaClient(transaction);
  const jobs = new PrismaReaderSummaryJobRepository(prisma);
  const artifacts = new PrismaReaderSummaryArtifactRepository(prisma);
  const tenant = tenantId(input.work.tenantId);
  const workspace = workspaceId(input.work.workspaceId);
  const policy = ReaderSummaryPolicy.create({
    id: deterministicUuid(`policy:${input.work.tenantId}:${input.work.workspaceId}`),
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    language: "auto",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 15,
    includeRisks: true,
    includeInterestHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    customInstructions: "Build a practical daily reader summary from immutable authority only.",
    createdAt: operationClock.now(),
    updatedAt: operationClock.now(),
  });
  const wiring = createReaderSummaryDailyPublicationExecutionWiring({
    replay,
    summaryClient: prisma,
    clock: operationClock,
    attestationSink: executionAttestations,
  });
  const queue = new CaptureQueue();
  const ids = new DeterministicRecoveryIds(input.work.modelJobIdentity);
  const request = await new RequestReaderSummaryUseCase(
    jobs,
    queue,
    new AllowingQuota(operationClock),
    ids,
    operationClock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    cadence: "daily",
    period: {
      startedAt: new Date(`${input.work.requestedUtcDate}T00:00:00.000Z`),
      endedAt: new Date(nextDate(input.work.requestedUtcDate)),
      timezone: "UTC",
    },
    idempotencyKey: `reader-summary-daily:${input.work.modelJobIdentity}`,
    correlationId: `reader-summary-daily:${input.work.modelJobIdentity}`,
  });
  if (!request.ok) throw request.error;
  const execution = await new ExecuteReaderSummaryJobUseCase(
    jobs,
    artifacts,
    new ExactRecoveryPolicyRepository(policy),
    frozenObservedThrough.evidenceSelector(wiring.evidenceSelector),
    frozenObservedThrough.model(exactModel(wiring.model)),
    new PrismaReaderSummaryPublication(prisma),
    ids,
    frozenObservedThrough.clock,
    undefined,
    undefined,
    wiring.topicMapBuilder,
    undefined,
    wiring.githubProjectionReader,
    wiring.historicalGithubOmission,
    wiring.recoveryProvenance,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryJobId: request.value.readerSummaryJobId,
    maxEvidenceItems: 200,
  });
  if (!execution.ok) throw execution.error;
  const artifactId = exactText(execution.value.readerSummaryId, "artifact id");
  const jobId = execution.value.readerSummaryJobId;
  const artifact = await artifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryId: artifactId,
  });
  if (artifact === null) {
    throw new Error("Canonical recovery artifact readback is missing");
  }
  assertFinalCitationsUseAuthority(replay.authority, artifact.toSnapshot().citationMap, 200);
  const frontendArtifact = presentReaderSummaryArtifact(artifact, {
    status: "fresh",
    checkedAt: operationClock.now(),
  });
  const evidenceRecord = {
    schemaVersion: 1,
    artifactId: "durable-reader-summary-postgres-evidence-v1",
    format: "durable-reader-summary-postgres-evidence-v1",
    generatedAt: completedAt,
    provenance: {
      runner: "scripts/run-reader-summary-daily-canonical-recovery.ts",
      fixtureOnly: false,
      database: "postgres",
      modelMode: "persisted-output_text",
      dailySourceAuthority: {
        schemaVersion: 2,
        canonicalSha256: input.work.sourceAuthoritySha256,
        modelJobIdentity: input.work.modelJobIdentity,
      },
    },
    scope: {
      tenantId: input.work.tenantId,
      workspaceId: input.work.workspaceId,
      summaryScope: "workspace",
    },
    period: frontendArtifact.period,
    inputInventory: wiring.inventory,
    queue: { capturedCommandCount: queue.count },
    result: {
      readerSummaryJobId: jobId,
      readerSummaryId: artifactId,
      status: execution.value.status,
      headline: frontendArtifact.headline,
      selectedFeedItemCount: frontendArtifact.coverage.selectedFeedItemCount,
      topReadCount: frontendArtifact.coverage.topReadCount,
      citationCount: frontendArtifact.coverage.citationCount,
      providerCount: frontendArtifact.coverage.providerCount,
      topProviderKeys: frontendArtifact.coverage.topProviderKeys,
      qualityFlags: frontendArtifact.qualityFlags,
    },
    executionAttestations: executionAttestations.all(),
    durableReadback: {
      summaryContentSha256: canonicalJsonSha256(frontendArtifact.content),
      topicMapSha256: canonicalJsonSha256(frontendArtifact.content.topicMap),
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      tokenValuesIncluded: false,
    },
  };
  const evidence = canonicalJsonBytes(evidenceRecord);
  // The presenter is an HTTP-facing object and legitimately uses undefined
  // for omitted optional fields. Bind the exact JSON transport projection,
  // not the in-memory TypeScript representation rejected by canonical JSON.
  const frontendTransportArtifact = JSON.parse(
    JSON.stringify(frontendArtifact),
  ) as unknown;
  const frontend = canonicalJsonBytes({
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt: completedAt,
    tenantId: input.work.tenantId,
    workspaceId: input.work.workspaceId,
    userId: "durable-reader-summary-live-user",
    readerSummaryArtifact: frontendTransportArtifact,
    evidence: evidenceRecord.result,
    redaction: evidenceRecord.redaction,
  });
  const rows = await transaction.$queryRaw<readonly Record<string, unknown>[]>`
    SELECT publication.id::TEXT AS "publicationId",
      btrim(publication.report_sha256) AS "reportSha256",
      btrim(publication.proof_sha256) AS "proofSha256",
      btrim(evidence.canonical_sha256) AS "weeklyEvidenceSha256",
      evidence.provider_evidence AS "providerEvidence"
    FROM public.reader_summary_publications publication
    JOIN public.reader_summary_weekly_publication_evidence evidence
      ON evidence.publication_id = publication.id
    WHERE publication.tenant_id = ${input.work.tenantId}::UUID
      AND publication.workspace_id = ${input.work.workspaceId}::UUID
      AND publication.reader_summary_job_id = ${jobId}::UUID
      AND publication.reader_summary_artifact_id = ${artifactId}::UUID
  `;
  const row = rows.length === 1 ? rows[0] : undefined;
  if (row === undefined) {
    throw new Error("Canonical recovery DB publication readback is missing");
  }
  assertFrozenPublicationEvidence(replay.authority, row.providerEvidence);
  return {
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    publicationId: exactText(row.publicationId, "publication id"),
    reportSha256: exactSha(row.reportSha256),
    proofSha256: exactSha(row.proofSha256),
    weeklyEvidenceSha256: exactSha(row.weeklyEvidenceSha256),
    publicEvidenceSha256: sha256(evidence),
    publicFrontendSha256: sha256(frontend),
    publicEvidenceBytes: evidence,
    publicFrontendBytes: frontend,
  };
};

/**
 * The shared use case obtains the prepublication observed-through value from a
 * Clock. Keep normal lifecycle timestamps at the DB completion time, but arm
 * exactly one post-model Clock read for the sealed ingestion cutoff. The
 * selector independently receives that same cutoff, so neither evidence nor
 * the GitHub audit can claim coverage beyond immutable authority.
 */
const createFrozenObservedThroughExecution = (input: {
  readonly completedAt: string;
  readonly ingestionCutoff: string;
}) => {
  let prepublicationCutoffArmed = false;
  const armPrepublicationCutoff = (): void => {
    if (prepublicationCutoffArmed) {
      throw new Error("Frozen observed-through clock was armed more than once");
    }
    prepublicationCutoffArmed = true;
  };
  const clock: Clock = {
    now: () => {
      if (prepublicationCutoffArmed) {
        prepublicationCutoffArmed = false;
        return new Date(input.ingestionCutoff);
      }
      return new Date(input.completedAt);
    },
  };
  return Object.freeze({
    clock,
    evidenceSelector: (
      delegate: ReaderSummaryEvidenceSelectorPort,
    ): ReaderSummaryEvidenceSelectorPort => ({
      select: (query) => delegate.select({
        ...query,
        observedThrough: new Date(input.ingestionCutoff),
      }),
    }),
    model: (delegate: ReaderSummaryModelPort): ReaderSummaryModelPort => ({
      ...delegate,
      generate: async (modelInput, selectedRoute) => {
        const generated = await delegate.generate(modelInput, selectedRoute);
        armPrepublicationCutoff();
        return generated;
      },
    }),
  });
};

const assertFrozenPublicationEvidence = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
  value: unknown,
): void => {
  if (!Array.isArray(value)) {
    throw new Error("Canonical recovery publication evidence is invalid");
  }
  const byFeedItemId = new Map(
    authority.items.map((item) => [item.feedItemId, item] as const),
  );
  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new Error("Canonical recovery publication evidence is invalid");
    }
    const item = byFeedItemId.get(exactText(entry.feedItemId, "publication feed item"));
    if (
      item === undefined ||
      entry.sourceItemId !== item.sourceItemId ||
      entry.providerKey !== item.providerKey ||
      entry.canonicalUrl !== item.canonicalUrl ||
      entry.title !== item.title ||
      entry.sourceText !== item.bodyPreview ||
      entry.publishedAt !== item.publishedAt ||
      entry.observedAt !== item.observedAt ||
      entry.sourceContentHash !== item.contentHash
    ) {
      throw new Error("Canonical recovery publication evidence diverges from frozen authority");
    }
  }
};

const assertFinalCitationsUseAuthority = (
  authority: VerifiedReaderSummaryDailySourceAuthority,
  citations: readonly Readonly<{
    citationId: string;
    feedItemId: string;
    sourceItemId: string;
    providerKey: string;
    field: string;
    canonicalUrl?: string;
  }>[],
  selectionLimit: number,
): void => {
  const selected = authority.items.slice(0, selectionLimit);
  const seen = new Set<string>();
  for (const citation of citations) {
    const match = /^c([1-9][0-9]*)$/u.exec(citation.citationId);
    const ordinal = match === null ? 0 : Number(match[1]);
    const item = selected[ordinal - 1];
    if (
      item === undefined ||
      seen.has(citation.citationId) ||
      citation.feedItemId !== item.feedItemId ||
      citation.sourceItemId !== item.sourceItemId ||
      citation.providerKey !== item.providerKey ||
      citation.field !== "canonicalUrl" ||
      citation.canonicalUrl !== item.canonicalUrl
    ) {
      throw new Error("Canonical recovery final citation diverges from frozen authority");
    }
    seen.add(citation.citationId);
  }
};

const replayInput = (
  input: Parameters<CanonicalRecoveryFinalizer["finalize"]>[0],
): ReaderSummaryDailyReplayInput => {
  const source = JSON.parse(input.work.sourceAuthorityBytes.toString("utf8")) as unknown;
  if (!isRecord(source)) {
    throw new Error("Canonical recovery source authority is invalid");
  }
  const ingestionCutoff = exactText(source.ingestionCutoff, "authority cutoff");
  const authority = verifyReaderSummaryDailySourceAuthority({
    tenantId: input.work.tenantId,
    workspaceId: input.work.workspaceId,
    requestedUtcDate: input.work.requestedUtcDate,
    authority: {
      requestedUtcDate: input.work.requestedUtcDate,
      ingestionCutoff,
      canonicalBytes: Buffer.from(input.work.sourceAuthorityBytes),
      canonicalSha256: input.work.sourceAuthoritySha256,
    },
  });
  if (!isReaderSummaryDailySourceAuthorityV2(authority)) {
    throw new Error("Canonical recovery persisted output_text requires immutable authority v2");
  }
  return Object.freeze({
    responseBytes: Buffer.from(input.responseBytes),
    receiptBytes: Buffer.from(input.receiptBytes),
    authoritySha256: input.work.sourceAuthoritySha256,
    ingestionCutoff,
    modelJobIdentity: input.work.modelJobIdentity,
    authority,
    outputKind: "output_text",
  });
};

const canonicalRecoveryPrismaClient = (
  client: PrismaReaderSummaryClient,
): PrismaSummaryClient => {
  const candidate: unknown = client;
  const delegates = {
    readerSummaryJob: ["findFirst", "findMany", "updateMany", "upsert"],
    readerSummaryArtifact: ["count", "findFirst", "findMany", "upsert"],
  } as const;
  if (
    !isRecord(candidate) ||
    typeof candidate.$queryRaw !== "function" ||
    Object.entries(delegates).some(([name, methods]) => {
      const delegate = candidate[name];
      return !isRecord(delegate) || methods.some((method) =>
        typeof delegate[method] !== "function");
    })
  ) {
    throw new Error("Canonical recovery Prisma transaction lacks required delegates");
  }
  return candidate as unknown as PrismaSummaryClient;
};

class DeterministicRecoveryIds implements IdGenerator {
  private index = 0;

  constructor(private readonly identity: string) {}

  generate(): string {
    this.index += 1;
    return deterministicUuid(`${this.identity}:${this.index}`);
  }
}

class CaptureQueue implements ReaderSummaryJobQueuePort {
  count = 0;

  async canAccept(
    _command: EnqueueReaderSummaryJobCommand,
  ): Promise<boolean> {
    void _command;
    return true;
  }

  async enqueue(_command: EnqueueReaderSummaryJobCommand): Promise<void> {
    void _command;
    this.count += 1;
  }
}

class AllowingQuota implements SummaryQuotaPort {
  constructor(private readonly clock: Clock) {}

  async reserveSummaryJob(
    _command: ReserveSummaryJobQuotaCommand,
  ): Promise<Result<ReserveSummaryJobQuotaResult, DomainError>> {
    void _command;
    return ok({ remaining: 1, resetAt: this.clock.now().toISOString() });
  }
}

class ExactRecoveryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  constructor(private readonly policy: ReaderSummaryPolicy) {}

  async save(): Promise<void> {
    throw new Error("Canonical recovery policy is immutable and cannot be persisted");
  }

  async findByScope(
    query: Parameters<ReaderSummaryPolicyRepositoryPort["findByScope"]>[0],
  ): Promise<ReaderSummaryPolicy | null> {
    const snapshot = this.policy.toSnapshot();
    return query.tenantId === snapshot.tenantId &&
      query.workspaceId === snapshot.workspaceId && query.scope.type === "workspace"
      ? this.policy
      : null;
  }

  async listScheduled(
    _query: Parameters<ReaderSummaryPolicyRepositoryPort["listScheduled"]>[0],
  ): Promise<readonly ReaderSummaryPolicy[]> {
    void _query;
    return [];
  }
}

export const stageReaderSummaryDailyCanonicalRecoveryPublicFiles = async (
  directory: string,
  identity: string,
  date: string,
  publication: Readonly<{
    publicEvidenceBytes: Buffer;
    publicFrontendBytes: Buffer;
  }>,
) => {
  const stageDirectory = `${directory}.daily-canonical-recovery-v4-staging`;
  mkdirSync(stageDirectory, { recursive: true, mode: 0o700 });
  chmodSync(stageDirectory, 0o700);
  mkdirSync(directory, { recursive: true });
  const files = [
    {
      staged: join(stageDirectory, `${identity}.evidence.next`),
      public: join(directory, `durable-reader-summary-${date}.v1.json`),
      bytes: publication.publicEvidenceBytes,
    },
    {
      staged: join(stageDirectory, `${identity}.frontend.next`),
      public: join(directory, `frontend-reader-summary-${date}.fixture.v1.json`),
      bytes: publication.publicFrontendBytes,
    },
  ];
  for (const file of files) writePrivateExact(file.staged, file.bytes);
  const created: string[] = [];
  return {
    publish: async () => {
      try {
        for (const file of files) {
          if (readExistingExact(file.public, file.bytes)) {
            rmSync(file.staged, { force: true });
            continue;
          }
          linkSync(file.staged, file.public);
          created.push(file.public);
          rmSync(file.staged, { force: true });
          chmodSync(file.public, 0o444);
          if (!readFileSync(file.public).equals(file.bytes)) {
            throw new Error("Canonical public file changed during publication");
          }
        }
      } catch (error) {
        for (const path of created) rmSync(path, { force: true });
        throw error;
      }
    },
    // Public files are immutable durable evidence once publish returns. A
    // finalization client error can be post-commit, so retries must reuse
    // exact bytes rather than delete a file that FINALIZED may already bind.
    cleanup: async () => {
      for (const file of files) rmSync(file.staged, { force: true });
    },
  };
};

const writePrivateExact = (path: string, bytes: Buffer): void => {
  try {
    if (readFileSync(path).equals(bytes)) return;
    throw new Error("Canonical recovery staged bytes conflict");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
};

const readExistingExact = (path: string, bytes: Buffer): boolean => {
  try {
    if (!readFileSync(path).equals(bytes)) {
      throw new Error("Canonical public file conflicts with immutable bytes");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const exactModel = <T>(model: T | undefined): T => {
  if (model === undefined) {
    throw new Error("Canonical recovery requires the persisted output_text model");
  }
  return model;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const deterministicUuid = (value: string): string => {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const requiredSystemDatabaseUrl = (): string => {
  // Production Compose exposes the explicit SYSTEM_DATABASE_URL name.
  // Backend rollout must advance daily-runner and runtime markers together.
  const value = required("SYSTEM_DATABASE_URL");
  const parsed = new URL(value);
  if (
    !/^postgres(?:ql)?:$/u.test(parsed.protocol) ||
    decodeURIComponent(parsed.username) !== "social_monitor_system_app" ||
    parsed.password.length === 0
  ) {
    throw new Error("SYSTEM_DATABASE_URL must use the production system login");
  }
  return value;
};

export const deriveReaderSummaryDailyTerminalDatabaseUrl = (
  systemDatabaseUrl: string,
): string => {
  const terminalDsn = new URL(systemDatabaseUrl);
  terminalDsn.username = readerSummaryDailyTerminalRole;
  return terminalDsn.toString();
};

const required = (name: string): string => exactText(process.env[name]?.trim(), name);

const exactText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
};

const exactSha = (value: unknown): string => {
  const digest = exactText(value, "SHA-256");
  if (!/^[0-9a-f]{64}$/u.test(digest)) throw new Error("SHA-256 is invalid");
  return digest;
};

const nextDate = (date: string): string =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString();

const positive = (value: string | undefined, fallback: number): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Runtime timeout must be positive");
  }
  return parsed;
};
