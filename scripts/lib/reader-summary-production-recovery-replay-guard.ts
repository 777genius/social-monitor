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
}>;
type ReceiptRow = Readonly<{ replayed: boolean }>;
type ClaimRow = Readonly<{
  claimed: boolean;
  staleJobSuperseded: boolean;
  rejectedArtifactSuperseded: boolean;
}>;
type LegacyRecoveryModelClaimPayload = Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_claim.v1";
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  planSha256s: readonly [string, string];
  providerEvidenceSha256: string;
  boundaries: Readonly<{
    stage: "pre_model";
    modelCallPerformed: false;
    recollectionPerformed: false;
  }>;
}>;
type RetryRecoveryModelClaimPayload = Readonly<{
  schemaVersion: "reader_summary.production_recovery_model_retry_claim.v1";
  recoveryId: string;
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  planSha256s: readonly [string, string];
  providerEvidenceSha256: string;
  supersedes: null | Readonly<{
    readerSummaryJobId: string;
    readerSummaryArtifactId: string | null;
    terminalStatus: "RUNNING" | "FAILED" | "REJECTED";
  }>;
  boundaries: Readonly<{
    stage: "pre_model";
    leaseConsumed: true;
    modelCallPerformed: false;
    recollectionPerformed: false;
    providerWritePerformed: false;
  }>;
}>;

const legacyClaimScope = "reader-summary-production-recovery-model-v2";
const retryClaimScope = "reader-summary-production-recovery-model-retry-v1";
const transactionOptions: PrismaSummaryTransactionOptions = Object.freeze({
  maxWait: 30_000,
  timeout: 300_000,
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
  }): Promise<"execute" | "replayed"> {
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
            throw new Error(
              "Reader summary production recovery retry lease was already consumed without final receipt",
            );
          }
          const retryClaim = retryRecoveryModelClaimPayload(
            params,
            ids,
            day,
            await readAndVerifyLegacyClaim(prisma, params, day),
          );
          const period = periodForRecoveryDate(params.requestedUtcDate);
          const serializedClaim = JSON.stringify(retryClaim);
          const claimId = deterministicClaimUuid(
            params.binding.recoveryId,
            params.requestedUtcDate,
          );
          const jobIdempotencyKey =
            readerSummaryProductionRecoveryJobIdempotencyKey(
              params.requestedUtcDate,
              day.canonicalSha256,
            );
          const supersededJobId =
            retryClaim.supersedes?.readerSummaryJobId ?? null;
          const supersededArtifactId =
            retryClaim.supersedes?.readerSummaryArtifactId ?? null;
          const supersededStatus =
            retryClaim.supersedes?.terminalStatus ?? null;
          const rows = await prisma.$queryRaw<readonly ClaimRow[]>`
            WITH claimed AS (
              INSERT INTO "idempotency_keys" (
                "id", "tenant_id", "workspace_id", "scope", "key",
                "request_hash", "response_status", "response_payload",
                "expires_at", "created_at"
              ) VALUES (
                ${claimId}::uuid,
                ${params.binding.tenantId}::uuid,
                ${params.binding.workspaceId}::uuid,
                ${retryClaimScope},
                ${params.requestedUtcDate},
                ${day.canonicalSha256},
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
              WHERE ${supersededStatus}::TEXT = 'RUNNING'
                AND "reader_summary_jobs"."id" =
                  ${supersededJobId}::uuid
                AND "reader_summary_jobs"."tenant_id" =
                  ${params.binding.tenantId}::uuid
                AND "reader_summary_jobs"."workspace_id" =
                  ${params.binding.workspaceId}::uuid
                AND "reader_summary_jobs"."status" = 'RUNNING'
                AND "reader_summary_jobs"."started_at" <=
                  transaction_timestamp() - INTERVAL '1 hour'
                AND "reader_summary_jobs"."completed_at" IS NULL
                AND "reader_summary_jobs"."failed_at" IS NULL
                AND "reader_summary_jobs"."reader_summary_artifact_id" IS NULL
              RETURNING "id"
            ),
            rejected_artifact AS (
              UPDATE "reader_summary_artifacts"
              SET "status" = 'SUPERSEDED',
                  "updated_at" = transaction_timestamp()
              FROM claimed
              WHERE ${supersededStatus}::TEXT = 'REJECTED'
                AND "reader_summary_artifacts"."id" =
                  ${supersededArtifactId}::uuid
                AND "reader_summary_artifacts"."tenant_id" =
                  ${params.binding.tenantId}::uuid
                AND "reader_summary_artifacts"."workspace_id" =
                  ${params.binding.workspaceId}::uuid
                AND "reader_summary_artifacts"."status" = 'REJECTED'
              RETURNING "id"
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
                ${ids.readerSummaryJobId}::uuid,
                ${params.binding.tenantId}::uuid,
                ${params.binding.workspaceId}::uuid,
                'workspace',
                'workspace',
                NULL,
                'daily',
                ${period.startedAt},
                ${period.endedAt},
                'UTC',
                ${period.periodKey},
                NULL,
                NULL,
                'RUNNING',
                ${jobIdempotencyKey},
                transaction_timestamp(),
                transaction_timestamp(),
                NULL,
                NULL,
                NULL,
                NULL,
                transaction_timestamp(),
                transaction_timestamp()
              FROM claimed
              RETURNING "id"
            )
            SELECT
              (SELECT count(*) FROM claimed) = 1
              AND (SELECT count(*) FROM job) = 1 AS "claimed",
              (SELECT count(*) FROM stale_job) = 1
                AS "staleJobSuperseded",
              (SELECT count(*) FROM rejected_artifact) = 1
                AS "rejectedArtifactSuperseded"
          `;
          const claimed = rows[0];
          if (
            rows.length !== 1 ||
            claimed?.claimed !== true ||
            claimed.staleJobSuperseded !==
              (supersededStatus === "RUNNING") ||
            claimed.rejectedArtifactSuperseded !==
              (supersededStatus === "REJECTED")
          ) {
            throw Object.assign(
              new Error(
                "Reader summary production recovery concurrent model claim requires a fresh snapshot",
              ),
              { code: "40001" },
            );
          }
          return "execute";
        },
        transactionOptions,
      ),
    );
  }
}

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
      job."failure_reason" AS "jobFailureReason"
    FROM "idempotency_keys" AS claim
    LEFT JOIN "reader_summary_jobs" AS job
      ON job."id" = ${ids.readerSummaryJobId}::uuid
      AND job."tenant_id" = claim."tenant_id"
      AND job."workspace_id" = claim."workspace_id"
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
  exactClaim:
    | LegacyRecoveryModelClaimPayload
    | RetryRecoveryModelClaimPayload,
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
  const statusInvalid =
    (row.jobStatus === "RUNNING" &&
      (row.jobFailedAt !== null ||
        row.jobReaderSummaryArtifactId !== null ||
        row.jobFailureReason !== null)) ||
    (row.jobStatus === "FAILED" &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== null ||
        (row.jobFailureReason ?? "").trim().length === 0)) ||
    (row.jobStatus === "REJECTED" &&
      (row.jobFailedAt === null ||
        row.jobReaderSummaryArtifactId !== ids.readerSummaryId ||
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

const legacyRecoveryModelClaimPayload = (
  params: {
    readonly binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    readonly requestedUtcDate: ReaderSummaryProductionRecoveryDate;
  },
  ids: ReturnType<typeof readerSummaryProductionRecoveryLegacyDayIds>,
  day: ReturnType<typeof dayAuthority>,
): LegacyRecoveryModelClaimPayload => ({
  schemaVersion: "reader_summary.production_recovery_model_claim.v1",
  recoveryId: params.binding.recoveryId,
  tenantId: params.binding.tenantId,
  workspaceId: params.binding.workspaceId,
  requestedUtcDate: params.requestedUtcDate,
  readerSummaryJobId: ids.readerSummaryJobId,
  readerSummaryArtifactId: ids.readerSummaryId,
  planSha256s: day.planSha256s,
  providerEvidenceSha256: day.providerEvidenceSha256,
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
  recoveryId: params.binding.recoveryId,
  tenantId: params.binding.tenantId,
  workspaceId: params.binding.workspaceId,
  requestedUtcDate: params.requestedUtcDate,
  readerSummaryJobId: ids.readerSummaryJobId,
  readerSummaryArtifactId: ids.readerSummaryId,
  planSha256s: day.planSha256s,
  providerEvidenceSha256: day.providerEvidenceSha256,
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
  boundaries: {
    stage: "pre_model",
    leaseConsumed: true,
    modelCallPerformed: false,
    recollectionPerformed: false,
    providerWritePerformed: false,
  },
});

const deterministicClaimUuid = (
  recoveryId: string,
  date: string,
): string => {
  const hash = createHash("sha256")
    .update(
      `reader-summary-production-recovery-retry-v1-claim:${recoveryId}:${date}`,
    )
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
