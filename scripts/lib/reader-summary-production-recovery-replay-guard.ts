import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
  type PrismaTransactionalSummaryClient,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import type {
  ReaderSummaryProductionRecoveryAuthorityBinding,
} from "@social-monitor/summary/ports";
import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  buildReaderSummaryProductionRecoveryModelClaim,
  buildReaderSummaryProductionRecoveryGapModelClaim,
  buildReaderSummaryProductionRecoveryRejectionEvidence,
  readerSummaryProductionRecoveryHistoricClaimSchemas,
  verifyReaderSummaryProductionRecoveryClaim,
  verifyReaderSummaryProductionRecoveryGapClaim,
  verifyReaderSummaryProductionRecoveryFinalReceipt,
  verifyReaderSummaryProductionRecoverySupersededPredecessor,
  type ReaderSummaryProductionRecoveryClaimExpectation,
  type ReaderSummaryProductionRecoveryFinalReceiptRow,
  type ReaderSummaryProductionRecoveryGenerationProfile,
  type ReaderSummaryProductionRecoveryGapClaimExpectation,
  type ReaderSummaryProductionRecoveryHistoricClaimSchema,
} from "./reader-summary-production-recovery-claim-verifier";
import {
  readerSummaryProductionRecoveryClaimExpectation,
  readerSummaryProductionRecoveryGapClaimExpectation,
  readerSummaryProductionRecoveryHistoricClaimExpectation,
  type ReaderSummaryProductionRecoveryDate,
  type ReaderSummaryProductionRecoveryExecutionGuard,
  type ReaderSummaryProductionRecoveryGapExecutionGuard,
} from "./reader-summary-production-recovery-cli";
import {
  periodForRecoveryDate,
  recoveryProvenanceForDay,
  recoveryGapProvenanceForDay,
  type ReaderSummaryProductionRecoveryDate as PersistedRecoveryDate,
} from "./reader-summary-production-recovery-data";
import type {
  ReaderSummaryProductionRecoveryGapAuthorityBinding,
  ReaderSummaryProductionRecoveryGapDate,
} from "./reader-summary-production-recovery-gap-authority";
import type { ReaderSummaryProductionRecoveryModelContract } from "./reader-summary-production-recovery-model-contract";

type QueryClient = Pick<PrismaSummaryClient, "$queryRaw">;

export type ReaderSummaryProductionRecoveryExecutionGuardClient =
  QueryClient &
    Partial<Pick<PrismaTransactionalSummaryClient, "$transaction">>;

type ClaimStateRow = Readonly<{
  claimScope: string;
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
  receiptTenantId: string | null;
  receiptWorkspaceId: string | null;
  receiptPublicationId: string | null;
  receiptJobId: string | null;
  receiptArtifactId: string | null;
  receiptRecoveryKind: string | null;
  receiptProvenance: unknown;
  receiptProvenanceSha256: string | null;
  receiptExact: unknown;
  receiptSha256: string | null;
  receiptRecordedAt: Date | null;
  publicationReportSha256: string | null;
  publicationProofSha256: string | null;
  publicationPublishedAt: Date | null;
}>;

type ClaimInsertRow = Readonly<{
  claimed: boolean;
  jobClaimed: boolean;
}>;

const claimScope = "reader-summary-production-recovery-model-v2";
const gapClaimScope = "reader-summary-production-recovery-model-v3";
const readableClaimScopes = [
  claimScope,
  "reader-summary-production-recovery-model-retry-v1",
  "reader-summary-production-recovery-model-resume-v1",
  "reader-summary-production-recovery-model-quality-remediation-v1",
  "reader-summary-production-recovery-model-quality-remediation-resume-v1",
] as const;

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
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }): ReturnType<ReaderSummaryProductionRecoveryExecutionGuard["claim"]> {
    return withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.client as PrismaSummaryClient,
        async (prisma) => {
          const expectation =
            readerSummaryProductionRecoveryClaimExpectation(params);
          const rows = await readClaimStates(prisma, params);
          const receipts = rows.filter(hasReceipt);
          if (receipts.length > 0) {
            if (receipts.length !== 1) {
              throw new Error(
                "Reader summary production recovery final receipt is ambiguous",
              );
            }
            verifyReplay(receipts[0]!, expectation, params, rows);
            return "replayed";
          }
          if (rows.length > 0) {
            if (rows.length !== 1) {
              throw new Error(
                "Reader summary production recovery model claim is ambiguous",
              );
            }
            return verifyConsumedClaim(
              rows[0]!,
              expectation,
              params,
              rows,
            );
          }
          await persistFreshClaim(prisma, expectation);
          return "execute";
        },
        transactionOptions,
      ),
    );
  }
}

export class PrismaReaderSummaryProductionRecoveryGapExecutionGuard
  implements ReaderSummaryProductionRecoveryGapExecutionGuard
{
  constructor(
    private readonly client: ReaderSummaryProductionRecoveryExecutionGuardClient,
  ) {}

  async claim(params: {
    binding: ReaderSummaryProductionRecoveryGapAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryGapDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
    modelContract: ReaderSummaryProductionRecoveryModelContract;
  }): ReturnType<ReaderSummaryProductionRecoveryGapExecutionGuard["claim"]> {
    return withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.client as PrismaSummaryClient,
        async (prisma) => {
          const expectation =
            readerSummaryProductionRecoveryGapClaimExpectation(params);
          const rows = await readGapClaimStates(prisma, expectation);
          if (rows.length > 1) {
            throw new Error(
              "Reader summary production recovery gap model claim is ambiguous",
            );
          }
          const row = rows[0];
          if (row !== undefined) {
            const verified = verifyGapClaimRow(row, expectation);
            if (hasReceipt(row)) {
              verifyExactJob(row, verified.payload, expectation, true);
              verifyReaderSummaryProductionRecoveryFinalReceipt(
                finalReceiptRow(row),
                {
                  claim: verified,
                  expectedProvenance: recoveryGapProvenanceForDay(
                    params.binding,
                    params.requestedUtcDate,
                  ),
                  predecessorStates: rows,
                },
              );
              return "replayed";
            }
            verifyExactJob(row, verified.payload, expectation, false);
            if (
              row.jobStatus === "REJECTED" &&
              row.jobReaderSummaryArtifactId === row.artifactId &&
              row.artifactId === expectation.readerSummaryArtifactId &&
              row.artifactStatus === "REJECTED" &&
              row.jobCompletedAt === null &&
              row.jobFailedAt !== null &&
              row.jobFailureReason !== null
            ) {
              return buildReaderSummaryProductionRecoveryRejectionEvidence({
                reason: "pre_publish_quality_gate",
                readerSummaryJobId: expectation.readerSummaryJobId,
                readerSummaryArtifactId: expectation.readerSummaryArtifactId,
                planCanonicalSha256: expectation.planCanonicalSha256,
              });
            }
            throw new Error(
              `Reader summary production recovery gap ${params.requestedUtcDate} has one unresolved durable claim`,
            );
          }
          await assertNoOtherGapClaimIsUnresolved(prisma, expectation);
          await persistFreshGapClaim(prisma, expectation);
          return "execute";
        },
        transactionOptions,
      ),
    );
  }
}

const readGapClaimStates = async (
  prisma: QueryClient,
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
): Promise<readonly ClaimStateRow[]> =>
  prisma.$queryRaw<readonly ClaimStateRow[]>`
    SELECT
      claim."scope" AS "claimScope", claim."request_hash" AS "requestHash",
      claim."response_status" AS "responseStatus",
      claim."response_payload" AS "responsePayload",
      job."id"::TEXT AS "jobId", job."scope_type" AS "jobScopeType",
      job."scope_key" AS "jobScopeKey", job."interest_id"::TEXT AS "jobInterestId",
      job."cadence" AS "jobCadence", job."period_started_at" AS "jobPeriodStartedAt",
      job."period_ended_at" AS "jobPeriodEndedAt",
      job."period_timezone" AS "jobPeriodTimezone", job."period_key" AS "jobPeriodKey",
      job."user_id" AS "jobUserId", job."subscription_id"::TEXT AS "jobSubscriptionId",
      job."status"::TEXT AS "jobStatus", job."idempotency_key" AS "jobIdempotencyKey",
      job."started_at" AS "jobStartedAt", job."completed_at" AS "jobCompletedAt",
      job."failed_at" AS "jobFailedAt",
      job."reader_summary_artifact_id"::TEXT AS "jobReaderSummaryArtifactId",
      job."failure_reason" AS "jobFailureReason",
      artifact."id"::TEXT AS "artifactId", artifact."status"::TEXT AS "artifactStatus",
      receipt."tenant_id"::TEXT AS "receiptTenantId",
      receipt."workspace_id"::TEXT AS "receiptWorkspaceId",
      receipt."publication_id"::TEXT AS "receiptPublicationId",
      receipt."reader_summary_job_id"::TEXT AS "receiptJobId",
      receipt."reader_summary_artifact_id"::TEXT AS "receiptArtifactId",
      receipt."recovery_kind" AS "receiptRecoveryKind",
      receipt."provenance" AS "receiptProvenance",
      btrim(receipt."provenance_sha256") AS "receiptProvenanceSha256",
      receipt."exact_receipt" AS "receiptExact",
      btrim(receipt."receipt_sha256") AS "receiptSha256",
      receipt."recorded_at" AS "receiptRecordedAt",
      publication."report_sha256" AS "publicationReportSha256",
      publication."proof_sha256" AS "publicationProofSha256",
      publication."published_at" AS "publicationPublishedAt"
    FROM "idempotency_keys" AS claim
    LEFT JOIN "reader_summary_jobs" AS job
      ON job."id" = ${expected.readerSummaryJobId}::uuid
      AND job."tenant_id" = claim."tenant_id"
      AND job."workspace_id" = claim."workspace_id"
    LEFT JOIN "reader_summary_artifacts" AS artifact
      ON artifact."id" = job."reader_summary_artifact_id"
      AND artifact."tenant_id" = job."tenant_id"
      AND artifact."workspace_id" = job."workspace_id"
    LEFT JOIN "reader_summary_recovery_receipts" AS receipt
      ON receipt."reader_summary_job_id" = job."id"
      AND receipt."tenant_id" = claim."tenant_id"
      AND receipt."workspace_id" = claim."workspace_id"
    LEFT JOIN "reader_summary_publications" AS publication
      ON publication."id" = receipt."publication_id"
      AND publication."reader_summary_job_id" = receipt."reader_summary_job_id"
      AND publication."reader_summary_artifact_id" = receipt."reader_summary_artifact_id"
    WHERE claim."tenant_id" = ${expected.tenantId}::uuid
      AND claim."workspace_id" = ${expected.workspaceId}::uuid
      AND claim."scope" = ${gapClaimScope}
      AND claim."key" = ${expected.requestedUtcDate}
    ORDER BY claim."created_at", claim."id"
    FOR UPDATE OF claim
  `;

const verifyGapClaimRow = (
  row: ClaimStateRow,
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
) => {
  if (
    row.claimScope !== gapClaimScope ||
    row.requestHash !== expected.planCanonicalSha256 ||
    row.responseStatus !== 102
  ) {
    throw new Error(
      "Reader summary production recovery gap claim envelope diverged",
    );
  }
  return verifyReaderSummaryProductionRecoveryGapClaim(
    asRecord(row.responsePayload),
    expected,
  );
};

const assertNoOtherGapClaimIsUnresolved = async (
  prisma: QueryClient,
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
): Promise<void> => {
  const rows = await prisma.$queryRaw<readonly { id: string }[]>`
    SELECT claim."id"::TEXT AS "id"
    FROM "idempotency_keys" AS claim
    LEFT JOIN "reader_summary_jobs" AS job
      ON job."tenant_id" = claim."tenant_id"
      AND job."workspace_id" = claim."workspace_id"
      AND job."id"::TEXT = claim."response_payload"->>'readerSummaryJobId'
    LEFT JOIN "reader_summary_artifacts" AS artifact
      ON artifact."id" = job."reader_summary_artifact_id"
      AND artifact."tenant_id" = job."tenant_id"
      AND artifact."workspace_id" = job."workspace_id"
    LEFT JOIN "reader_summary_recovery_receipts" AS receipt
      ON receipt."reader_summary_job_id" = job."id"
      AND receipt."tenant_id" = job."tenant_id"
      AND receipt."workspace_id" = job."workspace_id"
    LEFT JOIN "reader_summary_publications" AS publication
      ON publication."id" = receipt."publication_id"
      AND publication."reader_summary_job_id" = job."id"
      AND publication."reader_summary_artifact_id" = artifact."id"
    WHERE claim."tenant_id" = ${expected.tenantId}::uuid
      AND claim."workspace_id" = ${expected.workspaceId}::uuid
      AND claim."scope" = ${gapClaimScope}
      AND NOT COALESCE((
        (
          claim."response_status" = 102
          AND claim."response_payload"->>'schemaVersion' =
            'reader_summary.production_recovery_model_claim.v3'
          AND claim."response_payload"->>'requestedUtcDate' = claim."key"
          AND claim."response_payload"->>'tenantId' = claim."tenant_id"::TEXT
          AND claim."response_payload"->>'workspaceId' = claim."workspace_id"::TEXT
          AND claim."request_hash" =
            claim."response_payload"->>'planCanonicalSha256'
          AND job."scope_type" = 'workspace' AND job."scope_key" = 'workspace'
          AND job."cadence" = 'daily' AND job."period_key" =
            'daily:' || claim."key" || 'T00:00:00.000Z:' || CASE claim."key"
              WHEN '2026-07-29' THEN '2026-07-30'
              WHEN '2026-07-30' THEN '2026-07-31'
              WHEN '2026-07-31' THEN '2026-08-01'
            END || 'T00:00:00.000Z:UTC'
          AND job."period_timezone" = 'UTC'
          AND job."idempotency_key" =
            claim."response_payload"->>'recoveryIdentity'
          AND job."status" = 'REJECTED'
          AND job."completed_at" IS NULL
          AND job."failed_at" IS NOT NULL
          AND job."failure_reason" IS NOT NULL
          AND artifact."id"::TEXT =
            claim."response_payload"->>'readerSummaryArtifactId'
          AND artifact."status" = 'REJECTED'
        ) OR (
          claim."response_status" = 102
          AND claim."response_payload"->>'schemaVersion' =
            'reader_summary.production_recovery_model_claim.v3'
          AND claim."response_payload"->>'requestedUtcDate' = claim."key"
          AND claim."response_payload"->>'tenantId' = claim."tenant_id"::TEXT
          AND claim."response_payload"->>'workspaceId' = claim."workspace_id"::TEXT
          AND claim."request_hash" =
            claim."response_payload"->>'planCanonicalSha256'
          AND job."scope_type" = 'workspace' AND job."scope_key" = 'workspace'
          AND job."cadence" = 'daily' AND job."period_key" =
            'daily:' || claim."key" || 'T00:00:00.000Z:' || CASE claim."key"
              WHEN '2026-07-29' THEN '2026-07-30'
              WHEN '2026-07-30' THEN '2026-07-31'
              WHEN '2026-07-31' THEN '2026-08-01'
            END || 'T00:00:00.000Z:UTC'
          AND job."period_timezone" = 'UTC'
          AND job."idempotency_key" =
            claim."response_payload"->>'recoveryIdentity'
          AND job."status" = 'COMPLETED'
          AND job."completed_at" IS NOT NULL AND job."failed_at" IS NULL
          AND artifact."id"::TEXT =
            claim."response_payload"->>'readerSummaryArtifactId'
          AND artifact."status" = 'READY'
          AND receipt."recovery_kind" = 'SUMMARY_ONLY'
          AND receipt."reader_summary_artifact_id" = artifact."id"
          AND receipt."publication_id" = artifact."id"
          AND receipt."exact_receipt"->>'schemaVersion' =
            'reader_summary.recovery_receipt.v1'
          AND receipt."exact_receipt"->>'recoveryKind' = 'SUMMARY_ONLY'
          AND receipt."exact_receipt"->>'tenantId' = claim."tenant_id"::TEXT
          AND receipt."exact_receipt"->>'workspaceId' = claim."workspace_id"::TEXT
          AND receipt."exact_receipt"->>'publicationId' = artifact."id"::TEXT
          AND receipt."exact_receipt"->>'readerSummaryJobId' = job."id"::TEXT
          AND receipt."exact_receipt"->>'readerSummaryArtifactId' =
            artifact."id"::TEXT
          AND receipt."exact_receipt"->>'reportSha256' =
            publication."report_sha256"
          AND receipt."exact_receipt"->>'proofSha256' =
            publication."proof_sha256"
          AND receipt."exact_receipt"->'provenance' = receipt."provenance"
          AND receipt."exact_receipt"->>'provenanceSha256' =
            btrim(receipt."provenance_sha256")
          AND receipt."exact_receipt"->>'recordedAt' = to_char(
            receipt."recorded_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
          AND receipt."recorded_at" = publication."published_at"
          AND receipt."provenance"->'regenerationInputManifest'->>'sha256' =
            claim."request_hash"
          AND publication."id" IS NOT NULL
        )
    ), FALSE)
    ORDER BY claim."created_at", claim."id"
    FOR UPDATE OF claim
  `;
  if (rows.length > 0) {
    throw new Error(
      "Reader summary production recovery gap permits at most one unresolved day per run",
    );
  }
};

const persistFreshGapClaim = async (
  prisma: QueryClient,
  expected: ReaderSummaryProductionRecoveryGapClaimExpectation,
): Promise<void> => {
  const payload = buildReaderSummaryProductionRecoveryGapModelClaim(expected);
  const period = periodForRecoveryDate(
    expected.requestedUtcDate as unknown as PersistedRecoveryDate,
  );
  const rows = await prisma.$queryRaw<readonly ClaimInsertRow[]>`
    WITH claimed AS (
      INSERT INTO "idempotency_keys" (
        "id", "tenant_id", "workspace_id", "scope", "key",
        "request_hash", "response_status", "response_payload",
        "expires_at", "created_at"
      ) VALUES (
        ${deterministicClaimUuid(expected.recoveryIdentity)}::uuid,
        ${expected.tenantId}::uuid, ${expected.workspaceId}::uuid,
        ${gapClaimScope}, ${expected.requestedUtcDate},
        ${expected.planCanonicalSha256}, 102,
        ${JSON.stringify(payload)}::jsonb, NULL, transaction_timestamp()
      )
      ON CONFLICT ("tenant_id", "workspace_id", "scope", "key")
      DO NOTHING RETURNING "id"
    ), job AS (
      INSERT INTO "reader_summary_jobs" (
        "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
        "interest_id", "cadence", "period_started_at", "period_ended_at",
        "period_timezone", "period_key", "user_id", "subscription_id",
        "status", "idempotency_key", "requested_at", "started_at",
        "completed_at", "failed_at", "reader_summary_artifact_id",
        "failure_reason", "created_at", "updated_at"
      ) SELECT
        ${expected.readerSummaryJobId}::uuid, ${expected.tenantId}::uuid,
        ${expected.workspaceId}::uuid, 'workspace', 'workspace', NULL, 'daily',
        ${period.startedAt}, ${period.endedAt}, 'UTC', ${period.periodKey},
        NULL, NULL, 'RUNNING', ${expected.recoveryIdentity},
        transaction_timestamp(), transaction_timestamp(),
        NULL, NULL, NULL, NULL, transaction_timestamp(), transaction_timestamp()
      FROM claimed ON CONFLICT ("id") DO NOTHING RETURNING "id"
    )
    SELECT (SELECT count(*) FROM claimed) = 1 AS "claimed",
      (SELECT count(*) FROM job) = 1 AS "jobClaimed"
  `;
  if (rows.length !== 1 || !rows[0]?.claimed || !rows[0].jobClaimed) {
    throw new Error(
      "Reader summary production recovery gap concurrent model claim was rejected",
    );
  }
};

const readClaimStates = async (
  prisma: QueryClient,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
): Promise<readonly ClaimStateRow[]> => {
  const current = readerSummaryProductionRecoveryClaimExpectation(params);
  const historic = Object.fromEntries(
    readerSummaryProductionRecoveryHistoricClaimSchemas.map((schema) => [
      schema,
      readerSummaryProductionRecoveryHistoricClaimExpectation(
        params,
        schema,
      ),
    ]),
  ) as Readonly<
    Record<
      ReaderSummaryProductionRecoveryHistoricClaimSchema,
      ReaderSummaryProductionRecoveryClaimExpectation
    >
  >;
  return prisma.$queryRaw<readonly ClaimStateRow[]>`
    SELECT
      claim."scope" AS "claimScope",
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
      artifact."status"::TEXT AS "artifactStatus",
      receipt."tenant_id"::TEXT AS "receiptTenantId",
      receipt."workspace_id"::TEXT AS "receiptWorkspaceId",
      receipt."publication_id"::TEXT AS "receiptPublicationId",
      receipt."reader_summary_job_id"::TEXT AS "receiptJobId",
      receipt."reader_summary_artifact_id"::TEXT AS "receiptArtifactId",
      receipt."recovery_kind" AS "receiptRecoveryKind",
      receipt."provenance" AS "receiptProvenance",
      btrim(receipt."provenance_sha256") AS "receiptProvenanceSha256",
      receipt."exact_receipt" AS "receiptExact",
      btrim(receipt."receipt_sha256") AS "receiptSha256",
      receipt."recorded_at" AS "receiptRecordedAt",
      publication."report_sha256" AS "publicationReportSha256",
      publication."proof_sha256" AS "publicationProofSha256",
      publication."published_at" AS "publicationPublishedAt"
    FROM "idempotency_keys" AS claim
    LEFT JOIN "reader_summary_jobs" AS job
      ON job."id" = CASE
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_claim.v2'
          THEN ${current.readerSummaryJobId}::uuid
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_claim.v1'
          THEN ${historic[
            "reader_summary.production_recovery_model_claim.v1"
          ].readerSummaryJobId}::uuid
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_retry_claim.v1'
          THEN ${historic[
            "reader_summary.production_recovery_model_retry_claim.v1"
          ].readerSummaryJobId}::uuid
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_resume_claim.v1'
          THEN ${historic[
            "reader_summary.production_recovery_model_resume_claim.v1"
          ].readerSummaryJobId}::uuid
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_quality_remediation_claim.v1'
          THEN ${historic[
            "reader_summary.production_recovery_model_quality_remediation_claim.v1"
          ].readerSummaryJobId}::uuid
        WHEN claim."response_payload"->>'schemaVersion' =
          'reader_summary.production_recovery_model_quality_remediation_resume_claim.v1'
          THEN ${historic[
            "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1"
          ].readerSummaryJobId}::uuid
        ELSE NULL
      END
      AND job."tenant_id" = claim."tenant_id"
      AND job."workspace_id" = claim."workspace_id"
    LEFT JOIN "reader_summary_artifacts" AS artifact
      ON artifact."id" = job."reader_summary_artifact_id"
      AND artifact."tenant_id" = job."tenant_id"
      AND artifact."workspace_id" = job."workspace_id"
    LEFT JOIN "reader_summary_recovery_receipts" AS receipt
      ON receipt."reader_summary_job_id" = job."id"
      AND receipt."tenant_id" = claim."tenant_id"
      AND receipt."workspace_id" = claim."workspace_id"
    LEFT JOIN "reader_summary_publications" AS publication
      ON publication."id" = receipt."publication_id"
      AND publication."reader_summary_job_id" =
        receipt."reader_summary_job_id"
      AND publication."reader_summary_artifact_id" =
        receipt."reader_summary_artifact_id"
    WHERE claim."tenant_id" = ${params.binding.tenantId}::uuid
      AND claim."workspace_id" = ${params.binding.workspaceId}::uuid
      AND claim."scope" = ANY(${readableClaimScopes}::TEXT[])
      AND claim."key" = ${params.requestedUtcDate}
    ORDER BY claim."created_at", claim."id"
    FOR UPDATE OF claim
  `;
};

const persistFreshClaim = async (
  prisma: QueryClient,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
): Promise<void> => {
  const payload = buildReaderSummaryProductionRecoveryModelClaim(expectation);
  const period = periodForRecoveryDate(
    expectation.requestedUtcDate as PersistedRecoveryDate,
  );
  const rows = await prisma.$queryRaw<readonly ClaimInsertRow[]>`
    WITH claimed AS (
      INSERT INTO "idempotency_keys" (
        "id", "tenant_id", "workspace_id", "scope", "key",
        "request_hash", "response_status", "response_payload",
        "expires_at", "created_at"
      ) VALUES (
        ${deterministicClaimUuid(expectation.recoveryIdentity)}::uuid,
        ${expectation.tenantId}::uuid,
        ${expectation.workspaceId}::uuid,
        ${claimScope},
        ${expectation.requestedUtcDate},
        ${expectation.planCanonicalSha256},
        102,
        ${JSON.stringify(payload)}::jsonb,
        NULL,
        transaction_timestamp()
      )
      ON CONFLICT ("tenant_id", "workspace_id", "scope", "key")
      DO NOTHING
      RETURNING "id"
    ),
    job AS (
      INSERT INTO "reader_summary_jobs" (
        "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
        "interest_id", "cadence", "period_started_at", "period_ended_at",
        "period_timezone", "period_key", "user_id", "subscription_id",
        "status", "idempotency_key", "requested_at", "started_at",
        "completed_at", "failed_at", "reader_summary_artifact_id",
        "failure_reason", "created_at", "updated_at"
      )
      SELECT
        ${expectation.readerSummaryJobId}::uuid,
        ${expectation.tenantId}::uuid,
        ${expectation.workspaceId}::uuid,
        'workspace', 'workspace', NULL, 'daily',
        ${period.startedAt}, ${period.endedAt}, 'UTC', ${period.periodKey},
        NULL, NULL, 'RUNNING', ${expectation.recoveryIdentity},
        transaction_timestamp(), transaction_timestamp(),
        NULL, NULL, NULL, NULL,
        transaction_timestamp(), transaction_timestamp()
      FROM claimed
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    )
    SELECT
      (SELECT count(*) FROM claimed) = 1 AS "claimed",
      (SELECT count(*) FROM job) = 1 AS "jobClaimed"
  `;
  if (
    rows.length !== 1 ||
    rows[0]?.claimed !== true ||
    rows[0].jobClaimed !== true
  ) {
    throw new Error(
      "Reader summary production recovery concurrent model claim was rejected",
    );
  }
};

const verifyReplay = (
  row: ClaimStateRow,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
  rows: readonly ClaimStateRow[],
): void => {
  const verified = verifyClaimRow(row, expectation, params);
  verifyExactJob(
    row,
    verified.payload,
    claimExpectationForRow(row, params),
    true,
  );
  verifyReaderSummaryProductionRecoveryFinalReceipt(
    finalReceiptRow(row),
    {
      claim: verified,
      expectedProvenance: recoveryProvenanceForDay(
        params.binding,
        params.requestedUtcDate as PersistedRecoveryDate,
      ),
      predecessorStates: rows,
    },
  );
};

const verifyConsumedClaim = (
  row: ClaimStateRow,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
  rows: readonly ClaimStateRow[],
):
  | ReturnType<
      typeof buildReaderSummaryProductionRecoveryRejectionEvidence
    >
  | never => {
  const verified = verifyClaimRow(row, expectation, params);
  const verifiedExpectation = claimExpectationForRow(row, params);
  verifyReaderSummaryProductionRecoverySupersededPredecessor(
    verified,
    rows,
  );
  verifyExactJob(
    row,
    verified.payload,
    verifiedExpectation,
    false,
  );
  if (
    row.jobStatus === "REJECTED" &&
    row.jobReaderSummaryArtifactId === row.artifactId &&
    row.artifactId === verified.payload.readerSummaryArtifactId &&
    row.artifactStatus === "REJECTED" &&
    row.jobFailedAt !== null &&
    row.jobFailureReason !== null
  ) {
    return buildReaderSummaryProductionRecoveryRejectionEvidence({
      reason: "pre_publish_quality_gate",
      readerSummaryJobId: String(verified.payload.readerSummaryJobId),
      readerSummaryArtifactId: String(
        verified.payload.readerSummaryArtifactId,
      ),
      planCanonicalSha256: expectation.planCanonicalSha256,
    });
  }
  throw new Error(
    `Reader summary production recovery ${expectation.requestedUtcDate} durable pre-model lease was consumed without an exact final receipt`,
  );
};

const verifyClaimRow = (
  row: ClaimStateRow,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
) => {
  const payload = asRecord(row.responsePayload);
  assertClaimScopeMatchesSchema(row.claimScope, payload.schemaVersion);
  const rowExpectation = claimExpectationForSchema(
    payload.schemaVersion,
    params,
  );
  if (
    row.requestHash !== expectation.planCanonicalSha256 ||
    row.responseStatus !== 102
  ) {
    throw new Error(
      "Reader summary production recovery model claim envelope diverged",
    );
  }
  return verifyReaderSummaryProductionRecoveryClaim(
    payload,
    rowExpectation,
  );
};

const claimExpectationForRow = (
  row: ClaimStateRow,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
): ReaderSummaryProductionRecoveryClaimExpectation =>
  claimExpectationForSchema(
    asRecord(row.responsePayload).schemaVersion,
    params,
  );

const claimExpectationForSchema = (
  schema: unknown,
  params: Readonly<{
    binding: ReaderSummaryProductionRecoveryAuthorityBinding;
    requestedUtcDate: ReaderSummaryProductionRecoveryDate;
    generationProfile: ReaderSummaryProductionRecoveryGenerationProfile;
  }>,
): ReaderSummaryProductionRecoveryClaimExpectation => {
  if (schema === "reader_summary.production_recovery_model_claim.v2") {
    return readerSummaryProductionRecoveryClaimExpectation(params);
  }
  if (
    typeof schema !== "string" ||
    !(
      readerSummaryProductionRecoveryHistoricClaimSchemas as readonly string[]
    ).includes(schema)
  ) {
    throw new Error(
      "Reader summary production recovery claim schema is not supported",
    );
  }
  return readerSummaryProductionRecoveryHistoricClaimExpectation(
    params,
    schema as ReaderSummaryProductionRecoveryHistoricClaimSchema,
  );
};

const assertClaimScopeMatchesSchema = (
  scope: string,
  schema: unknown,
): void => {
  const expectedScopes: Readonly<Record<string, string>> = {
    "reader_summary.production_recovery_model_claim.v2": claimScope,
    "reader_summary.production_recovery_model_claim.v1": claimScope,
    "reader_summary.production_recovery_model_retry_claim.v1":
      "reader-summary-production-recovery-model-retry-v1",
    "reader_summary.production_recovery_model_resume_claim.v1":
      "reader-summary-production-recovery-model-resume-v1",
    "reader_summary.production_recovery_model_quality_remediation_claim.v1":
      "reader-summary-production-recovery-model-quality-remediation-v1",
    "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1":
      "reader-summary-production-recovery-model-quality-remediation-resume-v1",
  };
  if (
    typeof schema !== "string" ||
    expectedScopes[schema] !== scope
  ) {
    throw new Error(
      "Reader summary production recovery claim scope diverged",
    );
  }
};

const verifyExactJob = (
  row: ClaimStateRow,
  claim: Readonly<Record<string, unknown>>,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
  finalized: boolean,
): void => {
  const period = periodForRecoveryDate(
    expectation.requestedUtcDate as PersistedRecoveryDate,
  );
  const statusIsSafe =
    finalized
      ? ["COMPLETED", "NO_SIGNAL"].includes(row.jobStatus ?? "")
      : ["RUNNING", "FAILED", "REJECTED"].includes(
          row.jobStatus ?? "",
        );
  const terminalStateIsSafe =
    !finalized ||
    (row.jobCompletedAt !== null &&
      row.jobFailedAt === null &&
      row.jobReaderSummaryArtifactId ===
        expectation.readerSummaryArtifactId &&
      row.artifactId === expectation.readerSummaryArtifactId &&
      row.artifactStatus === "READY");
  if (
    row.jobId !== expectation.readerSummaryJobId ||
    claim.readerSummaryJobId !== expectation.readerSummaryJobId ||
    claim.readerSummaryArtifactId !==
      expectation.readerSummaryArtifactId ||
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
      expectedJobIdempotencyKey(claim, expectation) ||
    row.jobStartedAt === null ||
    !statusIsSafe ||
    !terminalStateIsSafe
  ) {
    throw new Error(
      "Reader summary production recovery claimed job diverged",
    );
  }
};

const expectedJobIdempotencyKey = (
  claim: Readonly<Record<string, unknown>>,
  expectation: ReaderSummaryProductionRecoveryClaimExpectation,
): string => {
  const prefixBySchema: Readonly<Record<string, string>> = {
    "reader_summary.production_recovery_model_claim.v1":
      "reader-summary-production-recovery",
    "reader_summary.production_recovery_model_retry_claim.v1":
      "reader-summary-production-recovery-retry-v1",
    "reader_summary.production_recovery_model_resume_claim.v1":
      "reader-summary-production-recovery-resume-v1",
    "reader_summary.production_recovery_model_quality_remediation_claim.v1":
      "reader-summary-production-recovery-quality-remediation-v1",
    "reader_summary.production_recovery_model_quality_remediation_resume_claim.v1":
      "reader-summary-production-recovery-quality-remediation-resume-v1",
  };
  if (
    claim.schemaVersion ===
      "reader_summary.production_recovery_model_claim.v2" ||
    claim.schemaVersion ===
      "reader_summary.production_recovery_model_claim.v3"
  ) {
    return expectation.recoveryIdentity;
  }
  const prefix = prefixBySchema[String(claim.schemaVersion)];
  if (prefix === undefined) {
    throw new Error(
      "Reader summary production recovery claimed job schema diverged",
    );
  }
  return `${prefix}:${expectation.requestedUtcDate}:${expectation.planCanonicalSha256}`;
};

const hasReceipt = (
  row: ClaimStateRow,
): row is ClaimStateRow &
  Readonly<{
    receiptPublicationId: string;
    receiptRecordedAt: Date;
  }> => row.receiptPublicationId !== null && row.receiptRecordedAt !== null;

const finalReceiptRow = (
  row: ClaimStateRow,
): ReaderSummaryProductionRecoveryFinalReceiptRow => {
  if (
    row.receiptTenantId === null ||
    row.receiptWorkspaceId === null ||
    row.receiptPublicationId === null ||
    row.receiptJobId === null ||
    row.receiptArtifactId === null ||
    row.receiptRecoveryKind === null ||
    row.receiptProvenanceSha256 === null ||
    row.receiptSha256 === null ||
    row.receiptRecordedAt === null ||
    row.publicationReportSha256 === null ||
    row.publicationProofSha256 === null ||
    row.publicationPublishedAt === null
  ) {
    throw new Error(
      "Reader summary production recovery final receipt is incomplete",
    );
  }
  return {
    tenantId: row.receiptTenantId,
    workspaceId: row.receiptWorkspaceId,
    publicationId: row.receiptPublicationId,
    readerSummaryJobId: row.receiptJobId,
    readerSummaryArtifactId: row.receiptArtifactId,
    recoveryKind: row.receiptRecoveryKind,
    provenance: row.receiptProvenance,
    provenanceSha256: row.receiptProvenanceSha256,
    exactReceipt: row.receiptExact,
    receiptSha256: row.receiptSha256,
    recordedAt: row.receiptRecordedAt,
    publicationReportSha256: row.publicationReportSha256,
    publicationProofSha256: row.publicationProofSha256,
    publicationPublishedAt: row.publicationPublishedAt,
  };
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Reader summary production recovery claim payload is invalid",
    );
  }
  return value as Record<string, unknown>;
};

const deterministicClaimUuid = (recoveryIdentity: string): string => {
  const hash = recoveryIdentity.slice(-64);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(
    13,
    16,
  )}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
