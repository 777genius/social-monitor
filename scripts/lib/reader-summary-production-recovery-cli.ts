import { createHash } from "node:crypto";

import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryModelPort,
  ReaderSummaryPolicyRepositoryPort,
  ReaderSummaryProductionRecoveryAuthorityBinding,
  ReaderSummaryPublicationPort,
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
  recoveryProvenanceForDay,
  type ReaderSummaryProductionRecoveryDate as PersistedRecoveryDate,
  type ReaderSummaryProductionRecoveryPlan,
} from "./reader-summary-production-recovery-data";
import {
  buildReaderSummaryProductionRecoveryRejectionEvidence,
  type ReaderSummaryProductionRecoveryClaimExpectation,
  type ReaderSummaryProductionRecoveryGenerationProfile,
  type ReaderSummaryProductionRecoveryHistoricClaimSchema,
  type ReaderSummaryProductionRecoveryRejectionEvidence,
} from "./reader-summary-production-recovery-claim-verifier";

export const readerSummaryProductionRecoveryHistoricalDates = [
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
] as const;

export type ReaderSummaryProductionRecoveryDate =
  (typeof readerSummaryProductionRecoveryHistoricalDates)[number];

export type ReaderSummaryProductionRecoveryCliArguments = Readonly<{
  apply: true;
  dates: readonly ReaderSummaryProductionRecoveryDate[];
}>;

export const parseReaderSummaryProductionRecoveryCliArguments = (
  argv: readonly string[],
): ReaderSummaryProductionRecoveryCliArguments => {
  let apply = false;
  let datesValue: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--apply") {
      if (apply) {
        throw cliArgumentError("--apply may be supplied only once");
      }
      apply = true;
      continue;
    }
    if (argument === "--dates") {
      if (datesValue !== undefined) {
        throw cliArgumentError("--dates may be supplied only once");
      }
      datesValue = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--dates=")) {
      if (datesValue !== undefined) {
        throw cliArgumentError("--dates may be supplied only once");
      }
      datesValue = argument.slice("--dates=".length);
      continue;
    }
    throw cliArgumentError(`unknown argument ${argument}`);
  }
  if (!apply) {
    throw cliArgumentError("--apply is required");
  }
  if (datesValue === undefined || datesValue.length === 0) {
    throw cliArgumentError("--dates requires an explicit non-empty subset");
  }
  const rawDates = datesValue.split(",");
  if (
    rawDates.some((date) => date.length === 0 || date !== date.trim())
  ) {
    throw cliArgumentError("--dates must be a comma-separated date list");
  }
  if (new Set(rawDates).size !== rawDates.length) {
    throw cliArgumentError("--dates must not contain duplicates");
  }
  const allowed = new Set<string>(
    readerSummaryProductionRecoveryHistoricalDates,
  );
  if (rawDates.some((date) => !allowed.has(date))) {
    throw cliArgumentError(
      "--dates accepts only 2026-07-23 through 2026-07-28",
    );
  }
  const selected = new Set(rawDates);
  return {
    apply: true,
    dates: readerSummaryProductionRecoveryHistoricalDates.filter((date) =>
      selected.has(date),
    ),
  };
};

export type ReaderSummaryProductionRecoveryDayResult = Readonly<{
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  outcome: "published" | "replayed" | "skipped";
  readerSummaryJobId?: string;
  readerSummaryId?: string;
  rejectionEvidence?: ReaderSummaryProductionRecoveryRejectionEvidence;
}>;

export type ReaderSummaryProductionRecoveryRunResult = Readonly<{
  outcome: "applied" | "replayed";
  plan: ReaderSummaryProductionRecoveryPlan;
  dayResults: readonly ReaderSummaryProductionRecoveryDayResult[];
}>;

export type ReaderSummaryProductionRecoveryDayExecutor = (params: {
  binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
}) => Promise<ReaderSummaryProductionRecoveryDayResult>;

export type ReaderSummaryProductionRecoveryExecutionGuard = Readonly<{
  claim(params: {
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }): Promise<
    | "execute"
    | "replayed"
    | ReaderSummaryProductionRecoveryRejectionEvidence
  >;
}>;

export type ReaderSummaryProductionRecoveryRunOptions = Readonly<{
  apply: boolean;
  dates: readonly ReaderSummaryProductionRecoveryDate[];
  generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  binding: ReaderSummaryProductionRecoveryAuthorityBinding;
  executionGuard: ReaderSummaryProductionRecoveryExecutionGuard;
  executeDay: ReaderSummaryProductionRecoveryDayExecutor;
}>;

export const runReaderSummaryProductionRecovery = async (
  options: ReaderSummaryProductionRecoveryRunOptions,
): Promise<ReaderSummaryProductionRecoveryRunResult> => {
  if (!options.apply) {
    throw new Error(
      "Reader summary production recovery requires --apply before persisted binding access",
    );
  }
  assertSelectedDates(options.dates);
  const binding = options.binding;
  const fullPlan = buildReaderSummaryProductionRecoveryPlan(binding);
  const selected = new Set<string>(options.dates);
  const plan = {
    ...fullPlan,
    days: fullPlan.days.filter((day) =>
      selected.has(day.requestedUtcDate),
    ),
  };
  if (plan.days.length !== options.dates.length) {
    throw new Error(
      "Reader summary production recovery persisted authority lacks a selected date",
    );
  }
  const dayResults: ReaderSummaryProductionRecoveryDayResult[] = [];
  for (const requestedUtcDate of options.dates) {
    const claim = await options.executionGuard.claim({
      binding,
      requestedUtcDate,
      generationProfile: options.generationProfile,
    });
    if (claim === "replayed") {
      dayResults.push({ requestedUtcDate, outcome: "replayed" });
    } else if (typeof claim === "object") {
      dayResults.push({
        requestedUtcDate,
        outcome: "skipped",
        readerSummaryJobId: claim.readerSummaryJobId,
        readerSummaryId: claim.readerSummaryArtifactId,
        rejectionEvidence: claim,
      });
    } else {
      dayResults.push(
        await options.executeDay({ binding, requestedUtcDate }),
      );
    }
  }
  return {
    outcome: dayResults.every((day) => day.outcome === "replayed")
      ? "replayed"
      : "applied",
    plan,
    dayResults,
  };
};

export const readerSummaryProductionRecoveryIdentity = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): string => {
  const day = authorityDay(binding, requestedUtcDate);
  return `reader_summary.production_recovery.generate.v2:${sha256(
    [
      binding.recoveryId,
      requestedUtcDate,
      day.canonicalSha256,
      day.providerEvidenceSha256,
    ].join(":"),
  )}`;
};

export const readerSummaryProductionRecoveryDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => {
  const identity = readerSummaryProductionRecoveryIdentity(
    binding,
    requestedUtcDate,
  );
  return {
    readerSummaryJobId: deterministicUuid(`${identity}:job`),
    readerSummaryId: deterministicUuid(`${identity}:artifact`),
  };
};

/**
 * Read-only compatibility identities for inspecting claims persisted by the
 * rejected v1f flow. The production execution path never creates these.
 */
export const readerSummaryProductionRecoveryLegacyDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => ({
  readerSummaryJobId: deterministicLegacyUuid(
    `reader-summary-production-recovery-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicLegacyUuid(
    `reader-summary-production-recovery-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryRetryDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => ({
  readerSummaryJobId: deterministicLegacyUuid(
    `reader-summary-production-recovery-retry-v1-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicLegacyUuid(
    `reader-summary-production-recovery-retry-v1-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryResumeDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => ({
  readerSummaryJobId: deterministicLegacyUuid(
    `reader-summary-production-recovery-resume-v1-job:${binding.recoveryId}:${requestedUtcDate}`,
  ),
  readerSummaryId: deterministicLegacyUuid(
    `reader-summary-production-recovery-resume-v1-artifact:${binding.recoveryId}:${requestedUtcDate}`,
  ),
});

export const readerSummaryProductionRecoveryQualityRemediationDayIds = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
): Readonly<{ readerSummaryJobId: string; readerSummaryId: string }> => {
  const evidenceSha256 = authorityDay(
    binding,
    requestedUtcDate,
  ).canonicalSha256;
  return {
    readerSummaryJobId: deterministicLegacyUuid(
      `reader-summary-production-recovery-quality-remediation-v1-job:${binding.recoveryId}:${requestedUtcDate}:${evidenceSha256}`,
    ),
    readerSummaryId: deterministicLegacyUuid(
      `reader-summary-production-recovery-quality-remediation-v1-artifact:${binding.recoveryId}:${requestedUtcDate}:${evidenceSha256}`,
    ),
  };
};

export const readerSummaryProductionRecoveryQualityRemediationResumeDayIds =
  (
    binding: ReaderSummaryProductionRecoveryAuthorityBinding,
    requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  ): Readonly<{
    readerSummaryJobId: string;
    readerSummaryId: string;
  }> => ({
    readerSummaryJobId: deterministicLegacyUuid(
      `reader-summary-production-recovery-quality-remediation-resume-v1-job:${binding.recoveryId}:${requestedUtcDate}`,
    ),
    readerSummaryId: deterministicLegacyUuid(
      `reader-summary-production-recovery-quality-remediation-resume-v1-artifact:${binding.recoveryId}:${requestedUtcDate}`,
    ),
  });

export const readerSummaryProductionRecoveryJobIdempotencyKey = (
  recoveryIdentity: string,
): string => recoveryIdentity;

export const readerSummaryProductionRecoveryClaimExpectation = (
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
): ReaderSummaryProductionRecoveryClaimExpectation => {
  const day = authorityDay(params.binding, params.requestedUtcDate);
  const ids = readerSummaryProductionRecoveryDayIds(
    params.binding,
    params.requestedUtcDate,
  );
  return {
    recoveryIdentity: readerSummaryProductionRecoveryIdentity(
      params.binding,
      params.requestedUtcDate,
    ),
    recoveryId: params.binding.recoveryId,
    tenantId: params.binding.tenantId,
    workspaceId: params.binding.workspaceId,
    requestedUtcDate: params.requestedUtcDate,
    readerSummaryJobId: ids.readerSummaryJobId,
    readerSummaryArtifactId: ids.readerSummaryId,
    planCanonicalSha256: day.canonicalSha256,
    dryRunCanonicalSha256s: day.planSha256s,
    providerEvidenceSha256: day.providerEvidenceSha256,
    generationProfile: params.generationProfile,
  };
};

export const readerSummaryProductionRecoveryHistoricClaimExpectation = (
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
  schema: ReaderSummaryProductionRecoveryHistoricClaimSchema,
): ReaderSummaryProductionRecoveryClaimExpectation => {
  const current = readerSummaryProductionRecoveryClaimExpectation(params);
  const ids =
    schema === "reader_summary.production_recovery_model_claim.v1"
      ? readerSummaryProductionRecoveryLegacyDayIds(
          params.binding,
          params.requestedUtcDate,
        )
      : schema ===
          "reader_summary.production_recovery_model_retry_claim.v1"
        ? readerSummaryProductionRecoveryRetryDayIds(
            params.binding,
            params.requestedUtcDate,
          )
        : schema ===
            "reader_summary.production_recovery_model_resume_claim.v1"
          ? readerSummaryProductionRecoveryResumeDayIds(
              params.binding,
              params.requestedUtcDate,
            )
          : schema ===
              "reader_summary.production_recovery_model_quality_remediation_claim.v1"
            ? readerSummaryProductionRecoveryQualityRemediationDayIds(
                params.binding,
                params.requestedUtcDate,
              )
            : readerSummaryProductionRecoveryQualityRemediationResumeDayIds(
                params.binding,
                params.requestedUtcDate,
              );
  return {
    ...current,
    readerSummaryJobId: ids.readerSummaryJobId,
    readerSummaryArtifactId: ids.readerSummaryId,
  };
};

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
    persistence: PrismaSummaryClient,
  ): ReaderSummaryProductionRecoveryDayExecutor =>
  async ({ binding, requestedUtcDate }) =>
    executeProductionRecoveryDay({
      ...dependencies,
      durableJobs: new PrismaReaderSummaryJobRepository(persistence),
      durableArtifacts: new PrismaReaderSummaryArtifactRepository(
        persistence,
      ),
      binding,
      requestedUtcDate,
    });

export const executeProductionRecoveryDay = async (
  params: ProductionRecoveryDayExecutorDependencies &
    Readonly<{
      durableJobs: ReaderSummaryJobRepositoryPort;
      durableArtifacts: ReaderSummaryArtifactRepositoryPort;
      binding: ReaderSummaryProductionRecoveryAuthorityBinding;
      requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    }>,
): Promise<ReaderSummaryProductionRecoveryDayResult> => {
  const persistedDate = params.requestedUtcDate as PersistedRecoveryDate;
  const period = periodForRecoveryDate(persistedDate);
  const ids = readerSummaryProductionRecoveryDayIds(
    params.binding,
    params.requestedUtcDate,
  );
  const recoveryIdentity = readerSummaryProductionRecoveryIdentity(
    params.binding,
    params.requestedUtcDate,
  );
  const expectedJob = ReaderSummaryJob.request({
    id: ids.readerSummaryJobId,
    tenantId: tenantId(params.binding.tenantId),
    workspaceId: workspaceId(params.binding.workspaceId),
    scope: { type: "workspace" },
    period,
    idempotencyKey:
      readerSummaryProductionRecoveryJobIdempotencyKey(recoveryIdentity),
    requestedAt: params.clock.now(),
  });
  const publications = new RecoveryFinalizationPublicationPort({
    finalization: params.finalization,
    provenance: recoveryProvenanceForDay(
      params.binding,
      persistedDate,
    ),
  });
  const execute = new ExecuteReaderSummaryJobUseCase(
    new PreclaimedRecoveryJobRepository(expectedJob, params.durableJobs),
    params.durableArtifacts,
    new EmptyRecoveryPolicyRepository(),
    new ProductionRecoveryEvidenceSelector({
      binding: params.binding,
      requestedUtcDate: persistedDate,
      maxPrimaryEvidenceItems: params.maxPrimaryEvidenceItems ?? 120,
      feedItems: params.feedItems,
      githubProjectionReader: params.githubProjectionReader,
      clock: params.clock,
    }),
    params.model,
    publications,
    new FirstIdRecoveryGenerator(ids.readerSummaryId, params.ids),
    params.clock,
    undefined,
    undefined,
    new BuildReaderSummaryTopicMapUseCase(),
    undefined,
    params.githubProjectionReader,
    historicalGitHubOmissionForRecoveryDay(
      params.binding,
      persistedDate,
    ),
  );
  const result = await execute.execute({
    tenantId: tenantId(params.binding.tenantId),
    workspaceId: workspaceId(params.binding.workspaceId),
    readerSummaryJobId: ids.readerSummaryJobId,
    maxEvidenceItems: params.maxPrimaryEvidenceItems ?? 120,
  });
  if (!result.ok) {
    throw result.error;
  }
  if (result.value.status === "quality_rejected") {
    const rejectedJob = await params.durableJobs.findById({
      tenantId: tenantId(params.binding.tenantId),
      workspaceId: workspaceId(params.binding.workspaceId),
      readerSummaryJobId: ids.readerSummaryJobId,
    });
    const rejected = rejectedJob?.toSnapshot();
    if (
      rejected?.status !== "quality_rejected" ||
      rejected.readerSummaryId !== ids.readerSummaryId ||
      rejected.failureReason === undefined
    ) {
      throw new Error(
        "Reader summary production recovery quality rejection is not durably exact",
      );
    }
    return {
      requestedUtcDate: params.requestedUtcDate,
      outcome: "skipped",
      readerSummaryJobId: result.value.readerSummaryJobId,
      readerSummaryId: result.value.readerSummaryId,
      rejectionEvidence:
        buildReaderSummaryProductionRecoveryRejectionEvidence({
          reason: "pre_publish_quality_gate",
          readerSummaryJobId: ids.readerSummaryJobId,
          readerSummaryArtifactId: ids.readerSummaryId,
          planCanonicalSha256: authorityDay(
            params.binding,
            params.requestedUtcDate,
          ).canonicalSha256,
        }),
    };
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
  requestedUtcDate: PersistedRecoveryDate,
): Readonly<{ reason: string; authorizedAt: Date }> | undefined => {
  const day = dayAuthority(binding, requestedUtcDate);
  if (day.githubEvidence.mode === "verified_existing") {
    return undefined;
  }
  const authorization = day.githubEvidence.authorization;
  const authorizedAt = new Date(authorization.authorizedAt);
  if (
    authorization.authorizedAt !== binding.lease.issuedAt ||
    authorization.authorizedAt !== binding.lease.consumedAt ||
    !Number.isFinite(authorizedAt.getTime()) ||
    authorization.reason.trim().length === 0
  ) {
    throw new Error(
      `Reader summary production recovery ${requestedUtcDate} historical GitHub omission authority is not exact`,
    );
  }
  return { reason: authorization.reason, authorizedAt };
};

class ProductionRecoveryEvidenceSelector
  implements ReaderSummaryEvidenceSelectorPort
{
  constructor(
    private readonly input: Parameters<
      typeof buildRecoveryEvidenceSelection
    >[0],
  ) {}

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

class RecoveryFinalizationPublicationPort
  implements ReaderSummaryPublicationPort
{
  lastOutcome: "published" | "replayed" | undefined;

  constructor(
    private readonly input: Readonly<{
      finalization: ReaderSummaryRecoveryFinalizationPort;
      provenance: ReturnType<typeof recoveryProvenanceForDay>;
    }>,
  ) {}

  async publish(
    command: Parameters<ReaderSummaryPublicationPort["publish"]>[0],
  ) {
    const outcome = await this.input.finalization.finalize({
      publication: command,
      provenance: this.input.provenance,
    });
    this.lastOutcome = outcome;
    return outcome;
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
    if (!this.claimAccepted && this.matches(params)) {
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
    if (this.claimAccepted || !this.matches(params)) {
      return null;
    }
    const durable = await this.durableJobs.findById(params);
    if (
      durable === null ||
      !isExactPreclaimedRecoveryJob(durable, this.expectedJob)
    ) {
      throw new Error(
        "Reader summary production recovery durable pre-model lease is invalid",
      );
    }
    this.claimAccepted = true;
    return durable;
  }

  private matches(params: {
    tenantId: string;
    workspaceId: string;
    readerSummaryJobId: string;
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
    durable.period.periodKey === expected.period.periodKey &&
    durable.idempotencyKey === expected.idempotencyKey &&
    durable.status === "running" &&
    durable.startedAt !== undefined &&
    durable.completedAt === undefined &&
    durable.failedAt === undefined &&
    durable.readerSummaryId === undefined &&
    durable.failureReason === undefined
  );
};

class EmptyRecoveryPolicyRepository
  implements ReaderSummaryPolicyRepositoryPort
{
  async save(): Promise<void> {}
  async findByScope(): Promise<null> {
    return null;
  }
  async listScheduled(): Promise<readonly []> {
    return [];
  }
}

const authorityDay = (
  binding: ReaderSummaryProductionRecoveryAuthorityBinding,
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
) =>
  dayAuthority(binding, requestedUtcDate as PersistedRecoveryDate);

const assertSelectedDates = (
  dates: readonly ReaderSummaryProductionRecoveryDate[],
): void => {
  if (
    dates.length === 0 ||
    new Set(dates).size !== dates.length ||
    dates.some(
      (date) =>
        !readerSummaryProductionRecoveryHistoricalDates.includes(date),
    )
  ) {
    throw new Error(
      "Reader summary production recovery dates must be a unique explicit historical subset",
    );
  }
};

const deterministicUuid = (value: string): string => {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest(),
  ).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const deterministicLegacyUuid = (value: string): string => {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest(),
  ).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const cliArgumentError = (reason: string): Error =>
  new Error(`Reader summary production recovery CLI: ${reason}`);
