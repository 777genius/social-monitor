import { createHash } from "node:crypto";

import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryModelPort,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryPublicationPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryProductionRecoveryAuthorityPort,
  ReaderSummaryRecoveryFinalizationPort,
} from "@social-monitor/summary/ports";
import {
  type Clock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryProductionRecoveryPlan,
  buildRecoveryEvidenceSelection,
  dayAuthority,
  periodForRecoveryDate,
  readerSummaryProductionRecoveryDates,
  recoveryProvenanceForDay,
  type ReaderSummaryProductionRecoveryDate,
  type ReaderSummaryProductionRecoveryPlan,
} from "./reader-summary-production-recovery-data";

export type ReaderSummaryProductionRecoveryRunResult = Readonly<{
  outcome: "applied" | "replayed";
  plan: ReaderSummaryProductionRecoveryPlan;
  dayResults: readonly ReaderSummaryProductionRecoveryDayResult[];
}>;

export type ReaderSummaryProductionRecoveryDayResult = Readonly<{
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  outcome: "published" | "replayed" | "skipped";
  readerSummaryJobId?: string;
  readerSummaryId?: string;
  skipEvidence?: ReaderSummaryProductionRecoverySkipEvidence;
}>;

export type ReaderSummaryProductionRecoveryExecutionIdentity =
  | "retry-v1"
  | "resume-v1";

export type ReaderSummaryProductionRecoverySkipEvidence = Readonly<{
  reason: "existing_quality_rejection";
  terminalStatus: "REJECTED";
  readerSummaryJobId: string;
  readerSummaryId: string;
  failureReason: string;
}>;

export type ReaderSummaryProductionRecoveryDayExecutor = (params: {
  readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  readonly executionIdentity: ReaderSummaryProductionRecoveryExecutionIdentity;
}) => Promise<ReaderSummaryProductionRecoveryDayResult>;

export type ReaderSummaryProductionRecoveryExecutionGuard = Readonly<{
  claim(params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  }): Promise<
    "execute" | "resume" | "replayed" | ReaderSummaryProductionRecoverySkipEvidence
  >;
}>;

export type ReaderSummaryProductionRecoveryRunOptions = Readonly<{
  apply: boolean;
  authority: ReaderSummaryProductionRecoveryAuthorityPort;
  executeDay: ReaderSummaryProductionRecoveryDayExecutor;
  executionGuard: ReaderSummaryProductionRecoveryExecutionGuard;
}>;

export const runReaderSummaryProductionRecovery = async (
  options: ReaderSummaryProductionRecoveryRunOptions,
): Promise<ReaderSummaryProductionRecoveryRunResult> => {
  if (!options.apply) {
    throw new Error(
      "Reader summary production recovery requires --apply before preparing durable authority",
    );
  }
  const prepared = await options.authority.prepare();
  const binding = options.authority.readVerifiedBinding(prepared.authority);
  const plan = buildReaderSummaryProductionRecoveryPlan(binding);
  if (prepared.outcome === "replayed") {
    return {
      outcome: "replayed",
      plan,
      dayResults: readerSummaryProductionRecoveryDates.map(
        (requestedUtcDate) => ({ requestedUtcDate, outcome: "skipped" }),
      ),
    };
  }
  const dayResults: ReaderSummaryProductionRecoveryDayResult[] = [];
  for (const requestedUtcDate of readerSummaryProductionRecoveryDates) {
    const claim = await options.executionGuard.claim({
      binding,
      requestedUtcDate,
    });
    if (claim === "replayed") {
      dayResults.push({
        requestedUtcDate,
        outcome: "replayed",
      });
      continue;
    }
    if (typeof claim === "object") {
      dayResults.push({
        requestedUtcDate,
        outcome: "skipped",
        readerSummaryJobId: claim.readerSummaryJobId,
        readerSummaryId: claim.readerSummaryId,
        skipEvidence: claim,
      });
      continue;
    }
    dayResults.push(await options.executeDay({
      binding,
      requestedUtcDate,
      executionIdentity: claim === "resume" ? "resume-v1" : "retry-v1",
    }));
  }
  return { outcome: "applied", plan, dayResults };
};

export const readerSummaryProductionRecoveryDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{
  readerSummaryJobId: string;
  readerSummaryId: string;
}> => ({
  readerSummaryJobId: deterministicUuid(
    `reader-summary-production-recovery-retry-v1-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicUuid(
    `reader-summary-production-recovery-retry-v1-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryLegacyDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{
  readerSummaryJobId: string;
  readerSummaryId: string;
}> => ({
  readerSummaryJobId: deterministicUuid(
    `reader-summary-production-recovery-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicUuid(
    `reader-summary-production-recovery-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryJobIdempotencyKey = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  planSha256: string,
): string =>
  `reader-summary-production-recovery-retry-v1:${requestedUtcDate}:${planSha256}`;

export const readerSummaryProductionRecoveryResumeDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => ({
  readerSummaryJobId: deterministicUuid(
    `reader-summary-production-recovery-resume-v1-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicUuid(
    `reader-summary-production-recovery-resume-v1-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryResumeJobIdempotencyKey = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  planSha256: string,
): string =>
  `reader-summary-production-recovery-resume-v1:${requestedUtcDate}:${planSha256}`;

export type ProductionRecoveryDayExecutorDependencies = Readonly<{
  model: ReaderSummaryModelPort;
  finalization: ReaderSummaryRecoveryFinalizationPort;
  durableJobs: ReaderSummaryJobRepositoryPort;
  durableArtifacts: ReaderSummaryArtifactRepositoryPort;
  feedItems: FeedItemReadRepositoryPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  ids: IdGenerator;
  clock: Clock;
  maxPrimaryEvidenceItems?: number;
}>;

export const createProductionRecoveryDayExecutor =
  (
    dependencies: Omit<
      ProductionRecoveryDayExecutorDependencies,
      "durableJobs" | "durableArtifacts"
    >,
    persistence: PrismaSummaryClient,
  ): ReaderSummaryProductionRecoveryDayExecutor =>
  async ({ binding, requestedUtcDate, executionIdentity }) =>
    executeProductionRecoveryDay({
      ...dependencies,
      durableJobs: new PrismaReaderSummaryJobRepository(persistence),
      durableArtifacts: new PrismaReaderSummaryArtifactRepository(
        persistence,
      ),
      binding,
      requestedUtcDate,
      executionIdentity,
    });

export const executeProductionRecoveryDay = async (
  params: ProductionRecoveryDayExecutorDependencies &
    Readonly<{
      binding: ReaderSummaryProductionRecoveryAuthorityBinding;
      requestedUtcDate: ReaderSummaryProductionRecoveryDate;
      executionIdentity?: ReaderSummaryProductionRecoveryExecutionIdentity;
    }>,
): Promise<ReaderSummaryProductionRecoveryDayResult> => {
  const day = dayAuthority(params.binding, params.requestedUtcDate);
  const period = periodForRecoveryDate(params.requestedUtcDate);
  const resume = params.executionIdentity === "resume-v1";
  const ids = resume
    ? readerSummaryProductionRecoveryResumeDayIds(
        params.binding,
        params.requestedUtcDate,
      )
    : readerSummaryProductionRecoveryDayIds(
        params.binding,
        params.requestedUtcDate,
      );
  const jobId = ids.readerSummaryJobId;
  const readerSummaryId = ids.readerSummaryId;
  const expectedJob = ReaderSummaryJob.request({
    id: jobId,
    tenantId: tenantId(params.binding.tenantId),
    workspaceId: workspaceId(params.binding.workspaceId),
    scope: { type: "workspace" },
    period,
    idempotencyKey: resume
      ? readerSummaryProductionRecoveryResumeJobIdempotencyKey(
          params.requestedUtcDate,
          day.canonicalSha256,
        )
      : readerSummaryProductionRecoveryJobIdempotencyKey(
          params.requestedUtcDate,
          day.canonicalSha256,
        ),
    requestedAt: params.clock.now(),
  });
  const jobs = new PreclaimedRecoveryJobRepository(
    expectedJob,
    params.durableJobs,
  );
  const evidenceSelector = new ProductionRecoveryEvidenceSelector({
    binding: params.binding,
    requestedUtcDate: params.requestedUtcDate,
    maxPrimaryEvidenceItems: params.maxPrimaryEvidenceItems ?? 120,
    feedItems: params.feedItems,
    githubProjectionReader: params.githubProjectionReader,
    clock: params.clock,
  });
  const publications = new RecoveryFinalizationPublicationPort({
    finalization: params.finalization,
    provenance: recoveryProvenanceForDay(params.binding, params.requestedUtcDate),
  });
  const execute = new ExecuteReaderSummaryJobUseCase(
    jobs,
    params.durableArtifacts,
    new EmptyRecoveryPolicyRepository(),
    evidenceSelector,
    params.model,
    publications,
    new FirstIdRecoveryGenerator(readerSummaryId, params.ids),
    params.clock,
    undefined,
    undefined,
    new BuildReaderSummaryTopicMapUseCase(),
    undefined,
    params.githubProjectionReader,
    historicalGitHubOmissionForRecoveryDay(
      params.binding,
      params.requestedUtcDate,
    ),
  );
  const result = await execute.execute({
    tenantId: tenantId(params.binding.tenantId),
    workspaceId: workspaceId(params.binding.workspaceId),
    readerSummaryJobId: jobId,
    maxEvidenceItems: params.maxPrimaryEvidenceItems ?? 120,
  });
  if (!result.ok) {
    throw result.error;
  }
  return {
    requestedUtcDate: params.requestedUtcDate,
    outcome: publications.lastOutcome ?? "published",
    readerSummaryJobId: result.value.readerSummaryJobId,
    readerSummaryId: result.value.readerSummaryId,
  };
};

export const historicalGitHubOmissionForRecoveryDay = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ reason: string; authorizedAt: Date }> | undefined => {
  const day = dayAuthority(binding, requestedUtcDate);
  if (day.githubEvidence.mode === "verified_existing") {
    return undefined;
  }
  const authorization = day.githubEvidence.authorization;
  const githubCounts = day.providerCounts.filter(
    (count) => count.providerKey === "github-trending-page",
  );
  const githubCount = githubCounts[0];
  const authorizedAt = new Date(authorization.authorizedAt);
  const period = periodForRecoveryDate(requestedUtcDate);
  if (
    day.githubEvidence.schemaVersion !==
      "reader_summary.production_recovery_github_evidence.v2" ||
    day.githubEvidence.providerKey !== "github-trending-page" ||
    day.githubEvidence.requestedUtcDate !== requestedUtcDate ||
    day.githubEvidence.evidenceCount !== 0 ||
    day.providerEvidence["github-trending-page"].length !== 0 ||
    githubCounts.length !== 1 ||
    githubCount?.count !== 0 ||
    githubCount.evidenceState !== "historical_unavailable" ||
    day.period.startedAt !== period.startedAt.toISOString() ||
    day.period.endedAt !== period.endedAt.toISOString() ||
    day.period.timezone !== "UTC" ||
    authorization.authorizationId !==
      `reader_summary.production_recovery.github.${requestedUtcDate}.v2` ||
    authorization.authorizedAt !== binding.lease.issuedAt ||
    authorization.authorizedAt !== binding.lease.consumedAt ||
    !Number.isFinite(authorizedAt.getTime()) ||
    authorizedAt.getTime() < period.endedAt.getTime() ||
    authorization.reason.trim().length === 0
  ) {
    throw new Error(
      `Reader summary production recovery ${requestedUtcDate} historical GitHub omission authority is not exact`,
    );
  }
  return { reason: authorization.reason.trim(), authorizedAt };
};

class ProductionRecoveryEvidenceSelector
  implements ReaderSummaryEvidenceSelectorPort
{
  constructor(private readonly input: Parameters<typeof buildRecoveryEvidenceSelection>[0]) {}

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    if (
      params.tenantId !== this.input.binding.tenantId ||
      params.workspaceId !== this.input.binding.workspaceId ||
      params.scope.type !== "workspace" ||
      params.period.periodKey !==
        periodForRecoveryDate(this.input.requestedUtcDate).periodKey
    ) {
      throw new Error(
        "Reader summary production recovery evidence selector received non-exact scope",
      );
    }
    return buildRecoveryEvidenceSelection(this.input);
  }
}

class RecoveryFinalizationPublicationPort implements ReaderSummaryPublicationPort {
  private outcome: "published" | "replayed" | undefined;

  constructor(
    private readonly params: Readonly<{
      finalization: ReaderSummaryRecoveryFinalizationPort;
      provenance: Parameters<ReaderSummaryRecoveryFinalizationPort["finalize"]>[0]["provenance"];
    }>,
  ) {}

  async publish(
    publication: Parameters<ReaderSummaryPublicationPort["publish"]>[0],
  ) {
    this.outcome = await this.params.finalization.finalize({
      publication,
      provenance: this.params.provenance,
    });
    return this.outcome;
  }

  get lastOutcome(): "published" | "replayed" | undefined {
    return this.outcome;
  }
}

class FirstIdRecoveryGenerator implements IdGenerator {
  private used = false;

  constructor(
    private readonly firstId: string,
    private readonly delegate: IdGenerator,
  ) {}

  generate(): string {
    if (!this.used) {
      this.used = true;
      return this.firstId;
    }
    return this.delegate.generate();
  }
}

class PreclaimedRecoveryJobRepository
  implements ReaderSummaryJobRepositoryPort
{
  private claimAccepted = false;

  constructor(
    private readonly expectedJob: ReaderSummaryJob,
    private readonly durableJobs: ReaderSummaryJobRepositoryPort,
  ) {}

  async save(job: ReaderSummaryJob): Promise<void> {
    await this.durableJobs.save(job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    if (!this.claimAccepted && this.matchesExpectedLocator(params)) {
      return this.expectedJob;
    }
    return this.durableJobs.findById(params);
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    return this.durableJobs.findByIdempotencyKey(params);
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return this.durableJobs.findRequested(params);
  }

  async claimForExecution(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["claimForExecution"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    if (this.claimAccepted || !this.matchesExpectedLocator(params)) {
      return null;
    }
    const durableJob = await this.durableJobs.findById(params);
    if (
      durableJob === null ||
      !isExactPreclaimedRecoveryJob(durableJob, this.expectedJob)
    ) {
      throw new Error(
        "Reader summary production recovery durable pre-model job authority is invalid",
      );
    }
    this.claimAccepted = true;
    return durableJob;
  }

  private matchesExpectedLocator(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly readerSummaryJobId: string;
  }): boolean {
    const expected = this.expectedJob.toSnapshot();
    return (
      params.tenantId === expected.tenantId &&
      params.workspaceId === expected.workspaceId &&
      params.readerSummaryJobId === expected.id
    );
  }
}

const isExactPreclaimedRecoveryJob = (
  durableJob: ReaderSummaryJob,
  expectedJob: ReaderSummaryJob,
): boolean => {
  const durable = durableJob.toSnapshot();
  const expected = expectedJob.toSnapshot();
  return (
    durable.id === expected.id &&
    durable.tenantId === expected.tenantId &&
    durable.workspaceId === expected.workspaceId &&
    durable.scope.type === "workspace" &&
    durable.period.cadence === expected.period.cadence &&
    durable.period.startedAt.getTime() === expected.period.startedAt.getTime() &&
    durable.period.endedAt.getTime() === expected.period.endedAt.getTime() &&
    durable.period.timezone === expected.period.timezone &&
    durable.period.periodKey === expected.period.periodKey &&
    durable.idempotencyKey === expected.idempotencyKey &&
    durable.userId === undefined &&
    durable.subscriptionId === undefined &&
    durable.status === "running" &&
    durable.startedAt !== undefined &&
    durable.completedAt === undefined &&
    durable.failedAt === undefined &&
    durable.readerSummaryId === undefined &&
    durable.failureReason === undefined
  );
};

class EmptyRecoveryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  async save(): Promise<void> {}
  async findByScope(): Promise<null> {
    return null;
  }
  async listScheduled(): Promise<readonly []> {
    return [];
  }
}

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(createHash("sha256").update(value).digest()).subarray(0, 16);
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
