import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
} from "@social-monitor/summary/ports";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
  type PrismaTransactionalSummaryClient,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  readerSummaryProductionRecoveryDayIds,
  readerSummaryProductionRecoveryJobIdempotencyKey,
  readerSummaryProductionRecoveryLegacyDayIds,
  readerSummaryProductionRecoveryQualityRemediationDayIds,
  readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey,
  readerSummaryProductionRecoveryQualityRemediationResumeDayIds,
  readerSummaryProductionRecoveryQualityRemediationResumeJobIdempotencyKey,
  readerSummaryProductionRecoveryResumeDayIds,
  readerSummaryProductionRecoveryResumeJobIdempotencyKey,
  type ReaderSummaryProductionRecoveryExecutionGuard,
} from "./reader-summary-production-recovery-cli";
import {
  dayAuthority,
  periodForRecoveryDate,
  recoveryProvenanceForDay,
  type ReaderSummaryProductionRecoveryDate,
} from "./reader-summary-production-recovery-data";

type QueryClient = Pick<PrismaSummaryClient, "$queryRaw">;
export type ReaderSummaryProductionRecoveryExecutionGuardClient =
  QueryClient &
    Partial<Pick<PrismaTransactionalSummaryClient, "$transaction">>;
type ExistingClaimRow = Readonly<{
  requestHash: string;
  responseStatus: number | null;
  responsePayload: unknown;
  jobId: string | null;
  jobScopeType: string | null;
  jobScopeKey: string | null;
  jobInterestId: string | null;
  jobCadence: string | null;
  jobPeriodStartedAt: Date | null;
  jobPeriodEndedAt: Date | null;
  jobPeriodTimezone: string | null;
  jobPeriodKey: string | null;
  jobUserId: string | null;
  jobSubscriptionId: string | null;
  jobStatus: string | null;
  jobIdempotencyKey: string | null;
  jobStartedAt: Date | null;
  jobCompletedAt: Date | null;
  jobFailedAt: Date | null;
  jobReaderSummaryArtifactId: string | null;
  jobFailureReason: string | null;
  artifactId: string | null;
  artifactStatus: string | null;
}>;
type ReceiptRow = Readonly<{ replayed: boolean }>;
type ClaimRow = Readonly<{
  claimed: boolean;
  staleJobSuperseded: boolean;
}>;
type RecoveryModelClaimCore = Readonly<{
  recoveryId: string; tenantId: string; workspaceId: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  readerSummaryJobId: string; readerSummaryArtifactId: string;
  planSha256s: readonly [string, string];
  providerEvidenceSha256: string;
}>;
type RecoveryModelClaimBoundaries = Readonly<{
  stage: "pre_model"; leaseConsumed: true; modelCallPerformed: false;
  recollectionPerformed: false; providerWritePerformed: false;
}>;
type FailedCanonicalBoundsSupersedes = Readonly<{
  readerSummaryJobId: string; readerSummaryArtifactId: null;
  terminalStatus: "FAILED"; infrastructureFailure: "postgres_canonical_bounds";
  failureReasonSha256: string;
}>;
type LegacyRecoveryModelClaimPayload = RecoveryModelClaimCore & Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_claim.v1";
  boundaries: Readonly<{
    stage: "pre_model"; modelCallPerformed: false;
    recollectionPerformed: false;
  }>;
}>;
type RetryRecoveryModelClaimPayload = RecoveryModelClaimCore & Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_retry_claim.v1";
  supersedes: null | Readonly<{
    readerSummaryJobId: string; readerSummaryArtifactId: string | null;
    terminalStatus: "RUNNING" | "FAILED" | "REJECTED";
  }>;
  boundaries: RecoveryModelClaimBoundaries;
}>;
type ResumeRecoveryModelClaimPayload = RecoveryModelClaimCore & Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_resume_claim.v1";
  supersedes: FailedCanonicalBoundsSupersedes;
  boundaries: RecoveryModelClaimBoundaries;
}>;
type QualityRemediationModelClaimPayload = RecoveryModelClaimCore & Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_quality_remediation_claim.v1";
  supersedes: Readonly<{
    claimScope: typeof legacyClaimScope | typeof retryClaimScope | typeof resumeClaimScope;
    readerSummaryJobId: string; readerSummaryArtifactId: string;
    terminalStatus: "REJECTED"; rejectionEvidenceSha256: string;
  }>;
  boundaries: RecoveryModelClaimBoundaries;
}>;
type QualityRemediationResumeModelClaimPayload =
  RecoveryModelClaimCore & Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1";
  supersedes: FailedCanonicalBoundsSupersedes & Readonly<{
    claimScope: typeof qualityRemediationClaimScope;
    rejectionEvidenceSha256: string;
  }>;
  boundaries: RecoveryModelClaimBoundaries;
}>;

const legacyClaimScope = "reader-summary-production-recovery-model-v2";
const retryClaimScope = "reader-summary-production-recovery-model-retry-v1";
const resumeClaimScope = "reader-summary-production-recovery-model-resume-v1";
const qualityRemediationClaimScope = "reader-summary-production-recovery-model-quality-remediation-v1";
const qualityRemediationResumeClaimScope = "reader-summary-production-recovery-model-quality-remediation-resume-v1";
type RecoveryClaimPayload =
  | LegacyRecoveryModelClaimPayload
  | RetryRecoveryModelClaimPayload
  | ResumeRecoveryModelClaimPayload
  | QualityRemediationModelClaimPayload
  | QualityRemediationResumeModelClaimPayload;
type QualityRemediationClaimInput = Readonly<{
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  };
  day: ReturnType<typeof dayAuthority>;
  rejected: ExistingClaimRow;
  rejectedClaimScope: typeof legacyClaimScope | typeof retryClaimScope | typeof resumeClaimScope;
}>;
const transactionOptions: PrismaSummaryTransactionOptions = Object.freeze({
  maxWait: 30_000,
  timeout: 300_000,
});
const recoveryModelClaimBoundaries: RecoveryModelClaimBoundaries =
  Object.freeze({
    stage: "pre_model",
    leaseConsumed: true,
    modelCallPerformed: false,
    recollectionPerformed: false,
    providerWritePerformed: false,
  });
export class PrismaReaderSummaryProductionRecoveryExecutionGuard
  implements ReaderSummaryProductionRecoveryExecutionGuard
{
  constructor(
    private readonly client: ReaderSummaryProductionRecoveryExecutionGuardClient,
  ) {}
  async claim(params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  }): ReturnType<ReaderSummaryProductionRecoveryExecutionGuard["claim"]> {
    return withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.client as PrismaSummaryClient,
        async (prisma) => {
          const day = dayAuthority(
            params.binding,
            params.requestedUtcDate,
          );
          if (await hasFinalReceipt(prisma, params)) {
            return "replayed";
          }
          if (
            day.planSha256s[0] !== day.canonicalSha256 ||
            day.planSha256s[1] !== day.canonicalSha256
          ) {
            throw new Error(
              "Reader summary production recovery two-pass plan hashes diverged",
            );
          }
          const ids = readerSummaryProductionRecoveryDayIds(
            params.binding,
            params.requestedUtcDate,
          );
          const existingRetry = await readClaim(
            prisma,
            params,
            retryClaimScope,
            ids,
          );
          if (existingRetry !== undefined) {
            assertConsumedRetryClaim(existingRetry, params, ids, day);
            const retryStatus = assertExactClaimedJob(
              existingRetry,
              params,
              ids,
              readerSummaryProductionRecoveryJobIdempotencyKey(
                params.requestedUtcDate,
                day.canonicalSha256,
              ),
            );
            if (retryStatus === "REJECTED") {
              return claimQualityRemediation(prisma, {
                params,
                day,
                rejected: existingRetry,
                rejectedClaimScope: retryClaimScope,
              });
            }
            if (
              retryStatus !== "FAILED" ||
              !isCanonicalBoundsInfrastructureFailure(
                existingRetry.jobFailureReason,
              )
            ) {
              throw consumedLeaseError(
                params.requestedUtcDate,
                "retry-v1",
                existingRetry.jobFailureReason,
              );
            }
            const resumeIds = readerSummaryProductionRecoveryResumeDayIds(
              params.binding,
              params.requestedUtcDate,
            );
            const existingResume = await readClaim(
              prisma,
              params,
              resumeClaimScope,
              resumeIds,
            );
            if (existingResume !== undefined) {
              const resumePayload = resumeRecoveryModelClaimPayload(
                params,
                resumeIds,
                day,
                existingRetry,
              );
              assertExactClaim(
                existingResume,
                resumePayload,
                day.canonicalSha256,
              );
              const resumeStatus = assertExactClaimedJob(
                existingResume,
                params,
                resumeIds,
                readerSummaryProductionRecoveryResumeJobIdempotencyKey(
                  params.requestedUtcDate,
                  day.canonicalSha256,
                ),
              );
              if (resumeStatus === "REJECTED") {
                return claimQualityRemediation(prisma, {
                  params,
                  day,
                  rejected: existingResume,
                  rejectedClaimScope: resumeClaimScope,
                });
              }
              throw consumedLeaseError(
                params.requestedUtcDate,
                "resume-v1",
                existingResume.jobFailureReason,
              );
            }
            await persistModelClaim(prisma, {
              params,
              day,
              ids: resumeIds,
              scope: resumeClaimScope,
              payload: resumeRecoveryModelClaimPayload(
                params,
                resumeIds,
                day,
                existingRetry,
              ),
              jobIdempotencyKey:
                readerSummaryProductionRecoveryResumeJobIdempotencyKey(
                  params.requestedUtcDate,
                  day.canonicalSha256,
                ),
              staleJobId: null,
            });
            return "resume";
          }
          const legacy = await readAndVerifyLegacyClaim(prisma, params, day);
          if (
            legacy !== undefined &&
            isQualityRejectedClaim(
              legacy,
              readerSummaryProductionRecoveryLegacyDayIds(
                params.binding,
                params.requestedUtcDate,
              ),
            )
          ) {
            return claimQualityRemediation(prisma, {
              params,
              day,
              rejected: legacy,
              rejectedClaimScope: legacyClaimScope,
            });
          }
          if (
            legacy?.jobStatus === "FAILED" &&
            !isCanonicalBoundsInfrastructureFailure(
              legacy.jobFailureReason,
            )
          ) {
            throw consumedLeaseError(
              params.requestedUtcDate,
              "legacy-v2",
              legacy.jobFailureReason,
            );
          }
          const retryClaim = retryRecoveryModelClaimPayload(
            params,
            ids,
            day,
            legacy,
          );
          await persistModelClaim(prisma, {
            params,
            day,
            ids,
            scope: retryClaimScope,
            payload: retryClaim,
            jobIdempotencyKey:
              readerSummaryProductionRecoveryJobIdempotencyKey(
                params.requestedUtcDate,
                day.canonicalSha256,
              ),
            staleJobId:
              legacy?.jobStatus === "RUNNING" ? legacy.jobId : null,
          });
          return "execute";
        },
        transactionOptions,
      ),
    );
  }
}

const persistModelClaim = async (
  prisma: QueryClient,
  input: Readonly<{
    params: {
      readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
      readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    };
    day: ReturnType<typeof dayAuthority>;
    ids: Readonly<{ readerSummaryJobId: string; readerSummaryId: string }>;
    scope: string;
    payload: Exclude<RecoveryClaimPayload, LegacyRecoveryModelClaimPayload>;
    jobIdempotencyKey: string;
    staleJobId: string | null;
  }>,
): Promise<void> => {
  const period = periodForRecoveryDate(input.params.requestedUtcDate);
  const serializedClaim = JSON.stringify(input.payload);
  const claimId = deterministicClaimUuid(
    input.scope,
    input.params.binding.recoveryId,
    input.params.requestedUtcDate,
  );
  const rows = await prisma.$queryRaw<readonly ClaimRow[]>`
    WITH claimed AS (
      INSERT INTO "idempotency_keys" (
        "id", "tenant_id", "workspace_id", "scope", "key",
        "request_hash", "response_status", "response_payload",
        "expires_at", "created_at"
      ) VALUES (
        ${claimId}::uuid,
        ${input.params.binding.tenantId}::uuid,
        ${input.params.binding.workspaceId}::uuid,
        ${input.scope},
        ${input.params.requestedUtcDate},
        ${input.day.canonicalSha256},
        102,
        ${serializedClaim}::jsonb,
        NULL,
        transaction_timestamp()
      )
      ON CONFLICT ("tenant_id", "workspace_id", "scope", "key")
      DO NOTHING
      RETURNING "id"
    ),
    stale_job AS (
      UPDATE "reader_summary_jobs"
      SET "status" = 'FAILED',
          "failed_at" = transaction_timestamp(),
          "failure_reason" =
            'Superseded stale production recovery model execution',
          "updated_at" = transaction_timestamp()
      FROM claimed
      WHERE ${input.staleJobId}::uuid IS NOT NULL
        AND "reader_summary_jobs"."id" = ${input.staleJobId}::uuid
        AND "reader_summary_jobs"."tenant_id" =
          ${input.params.binding.tenantId}::uuid
        AND "reader_summary_jobs"."workspace_id" =
          ${input.params.binding.workspaceId}::uuid
        AND "reader_summary_jobs"."status" = 'RUNNING'
        AND "reader_summary_jobs"."started_at" <=
          transaction_timestamp() - INTERVAL '1 hour'
        AND "reader_summary_jobs"."completed_at" IS NULL
        AND "reader_summary_jobs"."failed_at" IS NULL
        AND "reader_summary_jobs"."reader_summary_artifact_id" IS NULL
      RETURNING "reader_summary_jobs"."id"
    ),
    job AS (
      INSERT INTO "reader_summary_jobs" (
        "id", "tenant_id", "workspace_id", "scope_type",
        "scope_key", "interest_id", "cadence",
        "period_started_at", "period_ended_at", "period_timezone",
        "period_key", "user_id", "subscription_id", "status",
        "idempotency_key", "requested_at", "started_at",
        "completed_at", "failed_at", "reader_summary_artifact_id",
        "failure_reason", "created_at", "updated_at"
      )
      SELECT
        ${input.ids.readerSummaryJobId}::uuid,
        ${input.params.binding.tenantId}::uuid,
        ${input.params.binding.workspaceId}::uuid,
        'workspace', 'workspace', NULL, 'daily',
        ${period.startedAt}, ${period.endedAt}, 'UTC',
        ${period.periodKey}, NULL, NULL, 'RUNNING',
        ${input.jobIdempotencyKey},
        transaction_timestamp(), transaction_timestamp(),
        NULL, NULL, NULL, NULL,
        transaction_timestamp(), transaction_timestamp()
      FROM claimed
      RETURNING "id"
    )
    SELECT
      (SELECT count(*) FROM claimed) = 1
      AND (SELECT count(*) FROM job) = 1 AS "claimed",
      (SELECT count(*) FROM stale_job) = 1 AS "staleJobSuperseded"
  `;
  const claimed = rows[0];
  if (
    rows.length !== 1 ||
    claimed?.claimed !== true ||
    claimed.staleJobSuperseded !== (input.staleJobId !== null)
  ) {
    throw Object.assign(
      new Error(
        "Reader summary production recovery concurrent model claim requires a fresh snapshot",
      ),
      { code: "40001" },
    );
  }
};

const claimQualityRemediation = async (
  prisma: QueryClient,
  input: QualityRemediationClaimInput,
): Promise<"remediate-quality" | "resume-quality"> => {
  const ids = readerSummaryProductionRecoveryQualityRemediationDayIds(
    input.params.binding, input.params.requestedUtcDate);
  const payload = qualityRemediationModelClaimPayload(input, ids);
  const existing = await readClaim(prisma, input.params,
    qualityRemediationClaimScope, ids);
  if (existing !== undefined) {
    assertExactClaim(existing, payload, input.day.canonicalSha256);
    const status = assertExactClaimedJob(existing, input.params, ids,
      readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey(
        input.params.requestedUtcDate, input.day.canonicalSha256));
    if (
      status !== "FAILED" ||
      (!isCanonicalBoundsInfrastructureFailure(existing.jobFailureReason) &&
        !isKnownLegacyQualityRemediationBoundsFailure(
          input.params.requestedUtcDate,
          existing.jobFailureReason,
        ))
    ) {
      throw consumedLeaseError(
        input.params.requestedUtcDate,
        "quality-remediation-v1",
        existing.jobFailureReason,
      );
    }
    const resumeIds = readerSummaryProductionRecoveryQualityRemediationResumeDayIds(
      input.params.binding, input.params.requestedUtcDate);
    const resumePayload = qualityRemediationResumeModelClaimPayload(
      input, resumeIds, existing, payload);
    const existingResume = await readClaim(prisma, input.params,
      qualityRemediationResumeClaimScope, resumeIds);
    if (existingResume !== undefined) {
      assertExactClaim(existingResume, resumePayload, input.day.canonicalSha256);
      assertExactClaimedJob(existingResume, input.params, resumeIds,
        readerSummaryProductionRecoveryQualityRemediationResumeJobIdempotencyKey(
          input.params.requestedUtcDate, input.day.canonicalSha256));
      throw consumedLeaseError(
        input.params.requestedUtcDate, "quality-remediation-resume-v1",
        existingResume.jobFailureReason,
      );
    }
    await persistModelClaim(prisma, {
      params: input.params,
      day: input.day,
      ids: resumeIds,
      scope: qualityRemediationResumeClaimScope,
      payload: resumePayload,
      jobIdempotencyKey:
        readerSummaryProductionRecoveryQualityRemediationResumeJobIdempotencyKey(
          input.params.requestedUtcDate, input.day.canonicalSha256),
      staleJobId: null,
    });
    return "resume-quality";
  }
  await persistModelClaim(prisma, {
    params: input.params,
    day: input.day,
    ids,
    scope: qualityRemediationClaimScope,
    payload,
    jobIdempotencyKey:
      readerSummaryProductionRecoveryQualityRemediationJobIdempotencyKey(
        input.params.requestedUtcDate, input.day.canonicalSha256),
    staleJobId: null,
  });
  return "remediate-quality";
};

const hasFinalReceipt = async (
  prisma: QueryClient,
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
): Promise<boolean> => {
  const provenance = JSON.stringify(
    recoveryProvenanceForDay(
      params.binding,
      params.requestedUtcDate,
    ),
  );
  const rows = await prisma.$queryRaw<readonly ReceiptRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "reader_summary_recovery_receipts" AS receipt
      JOIN "reader_summary_publications" AS publication
        ON publication."id" = receipt."publication_id"
        AND publication."reader_summary_job_id" =
          receipt."reader_summary_job_id"
        AND publication."reader_summary_artifact_id" =
          receipt."reader_summary_artifact_id"
      WHERE receipt."tenant_id" = ${params.binding.tenantId}::uuid
        AND receipt."workspace_id" = ${params.binding.workspaceId}::uuid
        AND receipt."recovery_kind" = 'SUMMARY_ONLY'
        AND receipt."provenance" = ${provenance}::jsonb
    ) AS "replayed"
  `;
  return rows[0]?.replayed === true;
};

const readClaim = async (
  prisma: QueryClient,
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  scope: string,
  ids: Readonly<{
    readerSummaryJobId: string;
  }>,
): Promise<ExistingClaimRow | undefined> => {
  const rows = await prisma.$queryRaw<readonly ExistingClaimRow[]>`
    SELECT
      claim."request_hash" AS "requestHash",
      claim."response_status" AS "responseStatus",
      claim."response_payload" AS "responsePayload",
      job."id"::TEXT AS "jobId",
      job."scope_type" AS "jobScopeType",
      job."scope_key" AS "jobScopeKey",
      job."interest_id"::TEXT AS "jobInterestId",
      job."cadence" AS "jobCadence",
      job."period_started_at" AS "jobPeriodStartedAt",
      job."period_ended_at" AS "jobPeriodEndedAt",
      job."period_timezone" AS "jobPeriodTimezone",
      job."period_key" AS "jobPeriodKey",
      job."user_id" AS "jobUserId",
      job."subscription_id"::TEXT AS "jobSubscriptionId",
      job."status"::TEXT AS "jobStatus",
      job."idempotency_key" AS "jobIdempotencyKey",
      job."started_at" AS "jobStartedAt",
      job."completed_at" AS "jobCompletedAt",
      job."failed_at" AS "jobFailedAt",
      job."reader_summary_artifact_id"::TEXT AS
        "jobReaderSummaryArtifactId",
      job."failure_reason" AS "jobFailureReason",
      artifact."id"::TEXT AS "artifactId",
      artifact."status"::TEXT AS "artifactStatus"
    FROM "idempotency_keys" AS claim
    LEFT JOIN "reader_summary_jobs" AS job
      ON job."id" = ${ids.readerSummaryJobId}::uuid
      AND job."tenant_id" = claim."tenant_id"
      AND job."workspace_id" = claim."workspace_id"
    LEFT JOIN "reader_summary_artifacts" AS artifact
      ON artifact."id" = job."reader_summary_artifact_id"
      AND artifact."tenant_id" = job."tenant_id"
      AND artifact."workspace_id" = job."workspace_id"
    WHERE claim."tenant_id" = ${params.binding.tenantId}::uuid
      AND claim."workspace_id" = ${params.binding.workspaceId}::uuid
      AND claim."scope" = ${scope}
      AND claim."key" = ${params.requestedUtcDate}
    FOR SHARE OF claim
  `;
  if (rows.length > 1) {
    throw new Error(
      "Reader summary production recovery model claim is ambiguous",
    );
  }
  return rows[0];
};

const assertExactClaim = (
  row: ExistingClaimRow,
  exactClaim: RecoveryClaimPayload,
  planSha256: string,
): void => {
  if (
    row.requestHash !== planSha256 ||
    row.responseStatus !== 102 ||
    row.jobId === null ||
    !isDeepStrictEqual(row.responsePayload, exactClaim)
  ) {
    throw new Error(
      "Reader summary production recovery existing model claim diverged",
    );
  }
};

const readAndVerifyLegacyClaim = async (
  prisma: QueryClient,
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  day: ReturnType<typeof dayAuthority>,
): Promise<ExistingClaimRow | undefined> => {
  const ids = readerSummaryProductionRecoveryLegacyDayIds(
    params.binding,
    params.requestedUtcDate,
  );
  const row = await readClaim(prisma, params, legacyClaimScope, ids);
  if (row === undefined) {
    return undefined;
  }
  assertExactClaim(
    row,
    legacyRecoveryModelClaimPayload(params, ids, day),
    day.canonicalSha256,
  );
  const period = periodForRecoveryDate(params.requestedUtcDate);
  const commonInvalid =
    row.jobId !== ids.readerSummaryJobId ||
    row.jobScopeType !== "workspace" ||
    row.jobScopeKey !== "workspace" ||
    row.jobInterestId !== null ||
    row.jobCadence !== "daily" ||
    row.jobPeriodStartedAt?.getTime() !== period.startedAt.getTime() ||
    row.jobPeriodEndedAt?.getTime() !== period.endedAt.getTime() ||
    row.jobPeriodTimezone !== "UTC" ||
    row.jobPeriodKey !== period.periodKey ||
    row.jobUserId !== null ||
    row.jobSubscriptionId !== null ||
    row.jobIdempotencyKey !==
      `reader-summary-production-recovery:${params.requestedUtcDate}:${day.canonicalSha256}` ||
    row.jobStartedAt === null ||
    row.jobCompletedAt !== null;
  const qualityRejected = isQualityRejectedClaim(row, ids);
  const statusInvalid =
    (row.jobStatus === "RUNNING" &&
      (row.jobFailedAt !== null ||
        row.jobReaderSummaryArtifactId !== null ||
        row.jobFailureReason !== null ||
        row.artifactId !== null ||
        row.artifactStatus !== null)) ||
    (row.jobStatus === "FAILED" &&
      !qualityRejected &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== null ||
        (row.jobFailureReason ?? "").trim().length === 0 ||
        row.artifactId !== null ||
        row.artifactStatus !== null)) ||
    (row.jobStatus === "REJECTED" &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== ids.readerSummaryId ||
        row.artifactId !== ids.readerSummaryId ||
        row.artifactStatus !== "REJECTED" ||
        (row.jobFailureReason ?? "").trim().length === 0)) ||
    !["RUNNING", "FAILED", "REJECTED"].includes(row.jobStatus ?? "");
  if (commonInvalid || statusInvalid) {
    throw new Error(
      "Reader summary production recovery legacy model claim cannot be safely superseded",
    );
  }
  return row;
};

const assertConsumedRetryClaim = (
  row: ExistingClaimRow,
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: ReturnType<typeof readerSummaryProductionRecoveryDayIds>,
  day: ReturnType<typeof dayAuthority>,
): void => {
  const payload = row.responsePayload as
    | Partial<RetryRecoveryModelClaimPayload>
    | null;
  const supersedes = payload?.supersedes;
  const legacyIds = readerSummaryProductionRecoveryLegacyDayIds(
    params.binding,
    params.requestedUtcDate,
  );
  const supersedesValid =
    supersedes === null ||
    (typeof supersedes === "object" &&
      supersedes.readerSummaryJobId === legacyIds.readerSummaryJobId &&
      (supersedes.readerSummaryArtifactId === null ||
        supersedes.readerSummaryArtifactId === legacyIds.readerSummaryId) &&
      ["RUNNING", "FAILED", "REJECTED"].includes(
        supersedes.terminalStatus,
      ));
  if (!supersedesValid) {
    throw new Error(
      "Reader summary production recovery existing model claim diverged",
    );
  }
  assertExactClaim(
    row,
    {
      schemaVersion:
        "reader_summary.production_recovery_model_retry_claim.v1",
      recoveryId: params.binding.recoveryId,
      tenantId: params.binding.tenantId,
      workspaceId: params.binding.workspaceId,
      requestedUtcDate: params.requestedUtcDate,
      readerSummaryJobId: ids.readerSummaryJobId,
      readerSummaryArtifactId: ids.readerSummaryId,
      planSha256s: day.planSha256s,
      providerEvidenceSha256: day.providerEvidenceSha256,
      supersedes,
      boundaries: {
        stage: "pre_model",
        leaseConsumed: true,
        modelCallPerformed: false,
        recollectionPerformed: false,
        providerWritePerformed: false,
      },
    },
    day.canonicalSha256,
  );
};

const assertExactClaimedJob = (
  row: ExistingClaimRow,
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: Readonly<{ readerSummaryJobId: string; readerSummaryId: string }>,
  jobIdempotencyKey: string,
): "RUNNING" | "FAILED" | "REJECTED" => {
  const period = periodForRecoveryDate(params.requestedUtcDate);
  const commonInvalid =
    row.jobId !== ids.readerSummaryJobId ||
    row.jobScopeType !== "workspace" ||
    row.jobScopeKey !== "workspace" ||
    row.jobInterestId !== null ||
    row.jobCadence !== "daily" ||
    row.jobPeriodStartedAt?.getTime() !== period.startedAt.getTime() ||
    row.jobPeriodEndedAt?.getTime() !== period.endedAt.getTime() ||
    row.jobPeriodTimezone !== "UTC" ||
    row.jobPeriodKey !== period.periodKey ||
    row.jobUserId !== null ||
    row.jobSubscriptionId !== null ||
    row.jobIdempotencyKey !== jobIdempotencyKey ||
    row.jobStartedAt === null ||
    row.jobCompletedAt !== null;
  const qualityRejected = isQualityRejectedClaim(row, ids);
  const statusInvalid =
    (row.jobStatus === "RUNNING" &&
      (row.jobFailedAt !== null ||
        row.jobReaderSummaryArtifactId !== null ||
        row.jobFailureReason !== null ||
        row.artifactId !== null ||
        row.artifactStatus !== null)) ||
    (row.jobStatus === "FAILED" &&
      !qualityRejected &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== null ||
        (row.jobFailureReason ?? "").trim().length === 0 ||
        row.artifactId !== null ||
        row.artifactStatus !== null)) ||
    (row.jobStatus === "REJECTED" &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== ids.readerSummaryId ||
        row.artifactId !== ids.readerSummaryId ||
        row.artifactStatus !== "REJECTED" ||
        (row.jobFailureReason ?? "").trim().length === 0)) ||
    !["RUNNING", "FAILED", "REJECTED"].includes(row.jobStatus ?? "");
  if (commonInvalid || statusInvalid) {
    throw new Error(
      "Reader summary production recovery existing model claim job diverged",
    );
  }
  return qualityRejected
    ? "REJECTED"
    : row.jobStatus as "RUNNING" | "FAILED" | "REJECTED";
};

const isQualityRejectedClaim = (
  row: ExistingClaimRow,
  ids: Readonly<{ readerSummaryId: string }>,
): boolean =>
  (row.jobStatus === "REJECTED" || row.jobStatus === "FAILED") &&
  row.jobFailedAt !== null &&
  row.jobReaderSummaryArtifactId === ids.readerSummaryId &&
  row.artifactId === ids.readerSummaryId &&
  row.artifactStatus === "REJECTED" &&
  (row.jobFailureReason ?? "").trim().length > 0;

const isCanonicalBoundsInfrastructureFailure = (failureReason: string | null): boolean =>
  failureReason?.trim() === "weekly canonical JSON exceeds structural bounds" ||
  failureReason?.trim() === "weekly canonical JSON exceeds byte bounds";
const isKnownLegacyQualityRemediationBoundsFailure = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  failureReason: string | null,
): boolean =>
  requestedUtcDate === "2026-07-23" &&
  sha256(failureReason ?? "") ===
    "17318e621367dde799a0f55d635744baef8f7258041972b73c59b1f4584e4290";
const consumedLeaseError = (
  requestedUtcDate: ReaderSummaryProductionRecoveryDate,
  identity:
    | "legacy-v2"
    | "retry-v1"
    | "resume-v1"
    | "quality-remediation-v1"
    | "quality-remediation-resume-v1",
  failureReason: string | null,
): Error =>
  new Error(
    `Reader summary production recovery ${requestedUtcDate} ${identity} lease was already consumed without final receipt; failure_reason_sha256=${sha256(failureReason?.trim() ?? "")}`,
  );

const recoveryModelClaimCore = (
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: Readonly<{ readerSummaryJobId: string; readerSummaryId: string }>,
  day: ReturnType<typeof dayAuthority>,
): RecoveryModelClaimCore => ({
  recoveryId: params.binding.recoveryId,
  tenantId: params.binding.tenantId,
  workspaceId: params.binding.workspaceId,
  requestedUtcDate: params.requestedUtcDate,
  readerSummaryJobId: ids.readerSummaryJobId,
  readerSummaryArtifactId: ids.readerSummaryId,
  planSha256s: day.planSha256s,
  providerEvidenceSha256: day.providerEvidenceSha256,
});

const legacyRecoveryModelClaimPayload = (
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: ReturnType<typeof readerSummaryProductionRecoveryLegacyDayIds>,
  day: ReturnType<typeof dayAuthority>,
): LegacyRecoveryModelClaimPayload => ({
  schemaVersion: "reader_summary.production_recovery_model_claim.v1",
  ...recoveryModelClaimCore(params, ids, day),
  boundaries: {
    stage: "pre_model",
    modelCallPerformed: false,
    recollectionPerformed: false,
  },
});

const retryRecoveryModelClaimPayload = (
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: ReturnType<typeof readerSummaryProductionRecoveryDayIds>,
  day: ReturnType<typeof dayAuthority>,
  legacy: ExistingClaimRow | undefined,
): RetryRecoveryModelClaimPayload => ({
  schemaVersion: "reader_summary.production_recovery_model_retry_claim.v1",
  ...recoveryModelClaimCore(params, ids, day),
  supersedes:
    legacy === undefined
      ? null
      : {
          readerSummaryJobId: legacy.jobId!,
          readerSummaryArtifactId: legacy.jobReaderSummaryArtifactId,
          terminalStatus: legacy.jobStatus as
            | "RUNNING"
            | "FAILED"
            | "REJECTED",
  },
  boundaries: recoveryModelClaimBoundaries,
});

const resumeRecoveryModelClaimPayload = (
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: ReturnType<typeof readerSummaryProductionRecoveryResumeDayIds>,
  day: ReturnType<typeof dayAuthority>,
  retry: ExistingClaimRow,
): ResumeRecoveryModelClaimPayload => ({
  schemaVersion: "reader_summary.production_recovery_model_resume_claim.v1",
  ...recoveryModelClaimCore(params, ids, day),
  supersedes: {
    readerSummaryJobId: retry.jobId!,
    readerSummaryArtifactId: null,
    terminalStatus: "FAILED",
    infrastructureFailure: "postgres_canonical_bounds",
    failureReasonSha256: createHash("sha256")
      .update(retry.jobFailureReason!.trim())
      .digest("hex"),
  },
  boundaries: recoveryModelClaimBoundaries,
});

const qualityRemediationModelClaimPayload = (
  input: QualityRemediationClaimInput,
  ids: ReturnType<typeof readerSummaryProductionRecoveryQualityRemediationDayIds>,
): QualityRemediationModelClaimPayload => {
  const rejectionEvidenceSha256 = sha256(
    JSON.stringify({
      claimScope: input.rejectedClaimScope,
      readerSummaryJobId: input.rejected.jobId,
      readerSummaryArtifactId: input.rejected.jobReaderSummaryArtifactId,
      terminalStatus: "REJECTED",
      failureReasonSha256: sha256(input.rejected.jobFailureReason!.trim()),
      planSha256: input.day.canonicalSha256,
    }),
  );
  return {
    schemaVersion:
      "reader_summary.production_recovery_model_quality_remediation_claim.v1",
    ...recoveryModelClaimCore(input.params, ids, input.day),
    supersedes: {
      claimScope: input.rejectedClaimScope,
      readerSummaryJobId: input.rejected.jobId!,
      readerSummaryArtifactId: input.rejected.jobReaderSummaryArtifactId!,
      terminalStatus: "REJECTED",
      rejectionEvidenceSha256,
    },
    boundaries: recoveryModelClaimBoundaries,
  };
};

const qualityRemediationResumeModelClaimPayload = (
  input: QualityRemediationClaimInput,
  ids: ReturnType<typeof readerSummaryProductionRecoveryQualityRemediationResumeDayIds>,
  failed: ExistingClaimRow,
  remediation: QualityRemediationModelClaimPayload,
): QualityRemediationResumeModelClaimPayload => ({
  schemaVersion:
    "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1",
  ...recoveryModelClaimCore(input.params, ids, input.day),
  supersedes: {
    claimScope: qualityRemediationClaimScope,
    readerSummaryJobId: failed.jobId!, readerSummaryArtifactId: null,
    terminalStatus: "FAILED", infrastructureFailure: "postgres_canonical_bounds",
    failureReasonSha256: sha256(failed.jobFailureReason!.trim()),
    rejectionEvidenceSha256: remediation.supersedes.rejectionEvidenceSha256,
  },
  boundaries: recoveryModelClaimBoundaries,
});

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const deterministicClaimUuid = (
  scope: string,
  recoveryId: string,
  date: string,
): string => {
  const hash = createHash("sha256")
    .update(`${scope}-claim:${recoveryId}:${date}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
