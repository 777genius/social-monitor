import { createHash } from "node:crypto";

import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import {
  ReaderSummaryJob,
  type ReaderSummaryArtifact,
  type ReaderSummaryGitHubProjectionAudit,
  type ReaderSummaryPublicationDecision,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
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
  ReaderSummaryRejectedArtifactDebug,
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
}>;

export type ReaderSummaryProductionRecoveryDayExecutor = (params: {
  readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
}) => Promise<ReaderSummaryProductionRecoveryDayResult>;

export type ReaderSummaryProductionRecoveryExecutionGuard = Readonly<{
  claim(params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  }): Promise<"execute" | "replayed">;
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
    if (
      (await options.executionGuard.claim({
        binding,
        requestedUtcDate,
      })) === "replayed"
    ) {
      const ids = readerSummaryProductionRecoveryDayIds(
        binding,
        requestedUtcDate,
      );
      dayResults.push({
        requestedUtcDate,
        outcome: "replayed",
        readerSummaryJobId: ids.readerSummaryJobId,
        readerSummaryId: ids.readerSummaryId,
      });
      continue;
    }
    dayResults.push(await options.executeDay({ binding, requestedUtcDate }));
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
    `reader-summary-production-recovery-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicUuid(
    `reader-summary-production-recovery-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export type ProductionRecoveryDayExecutorDependencies = Readonly<{
  model: ReaderSummaryModelPort;
  finalization: ReaderSummaryRecoveryFinalizationPort;
  feedItems: FeedItemReadRepositoryPort;
  githubProjectionReader: ReaderSummaryGitHubProjectionReaderPort;
  ids: IdGenerator;
  clock: Clock;
  maxPrimaryEvidenceItems?: number;
}>;

export const createProductionRecoveryDayExecutor =
  (
    dependencies: ProductionRecoveryDayExecutorDependencies,
  ): ReaderSummaryProductionRecoveryDayExecutor =>
  async ({ binding, requestedUtcDate }) =>
    executeProductionRecoveryDay({
      ...dependencies,
      binding,
      requestedUtcDate,
    });

export const executeProductionRecoveryDay = async (
  params: ProductionRecoveryDayExecutorDependencies &
    Readonly<{
      binding: ReaderSummaryProductionRecoveryAuthorityBinding;
      requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    }>,
): Promise<ReaderSummaryProductionRecoveryDayResult> => {
  const day = dayAuthority(params.binding, params.requestedUtcDate);
  const period = periodForRecoveryDate(params.requestedUtcDate);
  const ids = readerSummaryProductionRecoveryDayIds(
    params.binding,
    params.requestedUtcDate,
  );
  const jobId = ids.readerSummaryJobId;
  const readerSummaryId = ids.readerSummaryId;
  const jobs = new InMemoryRecoveryJobRepository([
    ReaderSummaryJob.request({
      id: jobId,
      tenantId: tenantId(params.binding.tenantId),
      workspaceId: workspaceId(params.binding.workspaceId),
      scope: { type: "workspace" },
      period,
      idempotencyKey: `reader-summary-production-recovery:${params.requestedUtcDate}:${day.canonicalSha256}`,
      requestedAt: params.clock.now(),
    }),
  ]);
  const artifacts = new InMemoryRecoveryArtifactRepository();
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
    artifacts,
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
    undefined,
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

class InMemoryRecoveryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobs = new Map<string, ReaderSummaryJob>();

  constructor(initialJobs: readonly ReaderSummaryJob[]) {
    for (const job of initialJobs) {
      this.jobs.set(job.toSnapshot().id, job);
    }
  }

  async save(job: ReaderSummaryJob): Promise<void> {
    this.jobs.set(job.toSnapshot().id, job);
  }

  async findById(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly readerSummaryJobId: string;
  }): Promise<ReaderSummaryJob | null> {
    const job = this.jobs.get(params.readerSummaryJobId);
    const snapshot = job?.toSnapshot();
    return snapshot?.tenantId === params.tenantId &&
      snapshot.workspaceId === params.workspaceId
      ? job ?? null
      : null;
  }

  async findByIdempotencyKey(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  }): Promise<ReaderSummaryJob | null> {
    for (const job of this.jobs.values()) {
      const snapshot = job.toSnapshot();
      if (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.idempotencyKey === params.idempotencyKey
      ) {
        return job;
      }
    }
    return null;
  }

  async findRequested(params: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly limit: number;
  }): Promise<readonly ReaderSummaryJob[]> {
    return [...this.jobs.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.status === "requested" &&
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly readerSummaryJobId: string;
    readonly startedAt: Date;
  }): Promise<ReaderSummaryJob | null> {
    const job = await this.findById(params);
    if (job === null) {
      return null;
    }
    const snapshot = job.toSnapshot();
    if (snapshot.status !== "requested" && snapshot.status !== "failed") {
      return null;
    }
    const running =
      snapshot.status === "failed"
        ? job.retry({ requestedAt: params.startedAt }).start({
            startedAt: params.startedAt,
          })
        : job.start({ startedAt: params.startedAt });
    await this.save(running);
    return running;
  }
}

class InMemoryRecoveryArtifactRepository
  implements ReaderSummaryArtifactRepositoryPort
{
  private readonly artifacts = new Map<string, ReaderSummaryArtifact>();

  async save(
    artifact: ReaderSummaryArtifact,
    _options?: {
      readonly publicationDecision?: ReaderSummaryPublicationDecision;
      readonly githubProjectionAudit?: ReaderSummaryGitHubProjectionAudit;
    },
  ): Promise<void> {
    void _options;
    this.artifacts.set(artifact.toSnapshot().readerSummaryId, artifact);
  }

  async list(
    _query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    void _query;
    return { items: [] };
  }

  async listPeriodSummaries(
    _query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult> {
    void _query;
    return { items: [] };
  }

  async findById(params: {
    readonly readerSummaryId: string;
  }): Promise<ReaderSummaryArtifact | null> {
    return this.artifacts.get(params.readerSummaryId) ?? null;
  }

  async findRejectedDebugById(): Promise<ReaderSummaryRejectedArtifactDebug | null> {
    return null;
  }
}

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
