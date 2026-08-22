import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import type {
  ReaderSummaryRecoveryFinalizationCommand,
  ReaderSummaryRecoveryFinalizationOutcome,
  ReaderSummaryRecoveryFinalizationPort,
} from "../../../ports";
import { buildReaderSummaryPublicationPayload } from "../reader-summary-publication-proof";
import {
  buildReaderSummaryRecoveryReceiptPayload,
  type ReaderSummaryRecoveryFinalizationSqlRow,
} from "../reader-summary-recovery-receipt";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { verifyReaderSummaryDailyCanonicalRecoveryV4Provenance } from "./prisma-reader-summary-artifact.repository";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  runSerializableReaderSummaryTransaction,
  type PrismaSummaryTransactionOptions,
} from "./prisma-summary-transaction";

const recoveryFinalizationTransactionOptions: PrismaSummaryTransactionOptions =
  Object.freeze({
    maxWait: 30_000,
    timeout: 300_000,
  });

export type ReaderSummaryRecoveryFinalizationTransactionGuard = (
  client: PrismaReaderSummaryClient,
  command: ReaderSummaryRecoveryFinalizationCommand,
) => Promise<void>;

type RecoveryCandidateStageRow = Readonly<{ candidateExact: boolean }>;

export class PrismaReaderSummaryRecoveryFinalization
  implements ReaderSummaryRecoveryFinalizationPort
{
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly transactionGuard?:
      ReaderSummaryRecoveryFinalizationTransactionGuard,
  ) {}

  async finalize(
    command: ReaderSummaryRecoveryFinalizationCommand,
  ): Promise<ReaderSummaryRecoveryFinalizationOutcome> {
    const publication = buildReaderSummaryPublicationPayload(
      command.publication,
    );
    const receipt = buildReaderSummaryRecoveryReceiptPayload({
      publication,
      provenance: command.provenance,
    });
    const serializedPublication = JSON.stringify(publication);
    const serializedReceipt = JSON.stringify(receipt);
    const rows = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        async (prisma) => {
          await this.transactionGuard?.(prisma, command);
          await stageRecoveryCandidate(prisma, command, serializedPublication);
          return prisma.$queryRaw<readonly ReaderSummaryRecoveryFinalizationSqlRow[]>`
            SELECT *
            FROM "finalize_reader_summary_recovery"(
              ${serializedPublication}::jsonb,
              ${serializedReceipt}::jsonb
            )
          `;
        },
        recoveryFinalizationTransactionOptions,
      ),
    );
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error("PostgreSQL recovery finalization returned no outcome");
    }
    if (row.outcome !== "published" && row.outcome !== "replayed") {
      throw new Error(
        "PostgreSQL recovery finalization returned an invalid outcome",
      );
    }
    if (
      row.publication_id !== publication.readerSummaryArtifactId ||
      row.receipt_id !== publication.readerSummaryArtifactId
    ) {
      throw new Error(
        "PostgreSQL recovery finalization returned a mismatched identity",
      );
    }
    if (
      row.report_sha256 !== publication.reportSha256 ||
      row.proof_sha256 !== publication.proofSha256 ||
      row.provenance_sha256 !== receipt.provenanceSha256 ||
      row.receipt_sha256 !== receipt.receiptSha256
    ) {
      throw new Error(
        "PostgreSQL recovery finalization returned a mismatched proof",
      );
    }
    return row.outcome;
  }
}

const stageRecoveryCandidate = async (
  prisma: PrismaReaderSummaryClient,
  command: ReaderSummaryRecoveryFinalizationCommand,
  serializedPublication: string,
): Promise<void> => {
  if (command.candidate === undefined) return;
  const job = command.candidate.runningJob.toSnapshot();
  const publication = buildReaderSummaryPublicationPayload(command.publication);
  if (
    job.status !== "running" ||
    job.id !== publication.readerSummaryJobId ||
    job.tenantId !== publication.tenantId ||
    job.workspaceId !== publication.workspaceId ||
    job.requestedAt.toISOString() !== publication.requestedAt ||
    job.startedAt?.toISOString() !== publication.requestedAt
  ) {
    throw new Error("Reader summary recovery candidate does not bind publication");
  }
  const serializedJob = JSON.stringify({
    id: job.id,
    tenantId: job.tenantId,
    workspaceId: job.workspaceId,
    scopeType: job.scope.type,
    scopeKey: publication.scopeKey,
    interestId: job.scope.type === "interest" ? job.scope.interestId : null,
    cadence: job.period.cadence,
    periodStartedAt: job.period.startedAt.toISOString(),
    periodEndedAt: job.period.endedAt.toISOString(),
    periodTimezone: job.period.timezone,
    periodKey: job.period.periodKey,
    userId: job.userId ?? null,
    subscriptionId: job.subscriptionId ?? null,
    idempotencyKey: job.idempotencyKey,
    requestedAt: job.requestedAt.toISOString(),
    startedAt: job.startedAt.toISOString(),
  });
  const rows = await prisma.$queryRaw<readonly RecoveryCandidateStageRow[]>`
    WITH candidate AS (
      SELECT ${serializedPublication}::JSONB AS publication,
             ${serializedJob}::JSONB AS job
    ), artifact_insert AS (
      INSERT INTO reader_summary_artifacts (
        id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
        cadence, period_started_at, period_ended_at, period_timezone,
        period_key, user_id, subscription_id, status, schema_version,
        model_version, prompt_version, headline, summary_text,
        artifact_payload, citations, quality_signals, created_at, updated_at
      )
      SELECT
        (publication->>'readerSummaryArtifactId')::UUID,
        (publication->>'tenantId')::UUID,
        (publication->>'workspaceId')::UUID,
        publication->>'scopeType', publication->>'scopeKey',
        NULLIF(publication->>'interestId', '')::UUID,
        publication->>'cadence',
        (publication->>'periodStartedAt')::TIMESTAMPTZ,
        (publication->>'periodEndedAt')::TIMESTAMPTZ,
        publication->>'periodTimezone', publication->>'periodKey',
        NULLIF(publication->>'userId', ''),
        NULLIF(publication->>'subscriptionId', '')::UUID,
        'RUNNING', 1, publication->>'modelVersion',
        publication->'report'->>'promptVersion',
        publication->'report'->>'headline',
        publication->'report'->>'summaryText',
        publication->'report'->'artifactPayload',
        publication->'report'->'citations',
        publication->'report'->'qualitySignals',
        (publication->>'publishedAt')::TIMESTAMPTZ,
        (publication->>'publishedAt')::TIMESTAMPTZ
      FROM candidate ON CONFLICT (id) DO NOTHING
    ), job_insert AS (
      INSERT INTO reader_summary_jobs (
        id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
        cadence, period_started_at, period_ended_at, period_timezone,
        period_key, user_id, subscription_id, status, idempotency_key,
        requested_at, started_at, completed_at, failed_at,
        reader_summary_artifact_id, failure_reason, created_at, updated_at
      )
      SELECT
        (job->>'id')::UUID, (job->>'tenantId')::UUID,
        (job->>'workspaceId')::UUID, job->>'scopeType', job->>'scopeKey',
        NULLIF(job->>'interestId', '')::UUID, job->>'cadence',
        (job->>'periodStartedAt')::TIMESTAMPTZ,
        (job->>'periodEndedAt')::TIMESTAMPTZ, job->>'periodTimezone',
        job->>'periodKey', NULLIF(job->>'userId', ''),
        NULLIF(job->>'subscriptionId', '')::UUID, 'RUNNING',
        job->>'idempotencyKey', (job->>'requestedAt')::TIMESTAMPTZ,
        (job->>'startedAt')::TIMESTAMPTZ, NULL, NULL, NULL, NULL,
        (job->>'requestedAt')::TIMESTAMPTZ,
        (job->>'requestedAt')::TIMESTAMPTZ
      FROM candidate ON CONFLICT (id) DO NOTHING
    )
    SELECT
      EXISTS (
        SELECT 1 FROM reader_summary_artifacts artifact, candidate
        WHERE artifact.id = (publication->>'readerSummaryArtifactId')::UUID
          AND artifact.tenant_id = (publication->>'tenantId')::UUID
          AND artifact.workspace_id = (publication->>'workspaceId')::UUID
          AND artifact.scope_type = publication->>'scopeType'
          AND artifact.scope_key = publication->>'scopeKey'
          AND artifact.interest_id IS NOT DISTINCT FROM
            NULLIF(publication->>'interestId', '')::UUID
          AND artifact.cadence = publication->>'cadence'
          AND artifact.period_started_at =
            (publication->>'periodStartedAt')::TIMESTAMPTZ
          AND artifact.period_ended_at =
            (publication->>'periodEndedAt')::TIMESTAMPTZ
          AND artifact.period_timezone = publication->>'periodTimezone'
          AND artifact.period_key = publication->>'periodKey'
          AND artifact.user_id IS NOT DISTINCT FROM
            NULLIF(publication->>'userId', '')
          AND artifact.subscription_id IS NOT DISTINCT FROM
            NULLIF(publication->>'subscriptionId', '')::UUID
          AND artifact.status IN ('RUNNING',
            (publication->>'semanticStatus')::"SummaryStatus")
          AND artifact.schema_version = 1
          AND artifact.model_version = publication->>'modelVersion'
          AND artifact.prompt_version = publication->'report'->>'promptVersion'
          AND artifact.headline = publication->'report'->>'headline'
          AND artifact.summary_text IS NOT DISTINCT FROM
            publication->'report'->>'summaryText'
          AND artifact.artifact_payload =
            publication->'report'->'artifactPayload'
          AND artifact.citations = publication->'report'->'citations'
          AND artifact.quality_signals = publication->'report'->'qualitySignals'
      ) AND EXISTS (
        SELECT 1 FROM reader_summary_jobs persisted, candidate
        WHERE persisted.id = (job->>'id')::UUID
          AND persisted.tenant_id = (job->>'tenantId')::UUID
          AND persisted.workspace_id = (job->>'workspaceId')::UUID
          AND persisted.scope_type = job->>'scopeType'
          AND persisted.scope_key = job->>'scopeKey'
          AND persisted.interest_id IS NOT DISTINCT FROM
            NULLIF(job->>'interestId', '')::UUID
          AND persisted.cadence = job->>'cadence'
          AND persisted.period_started_at =
            (job->>'periodStartedAt')::TIMESTAMPTZ
          AND persisted.period_ended_at =
            (job->>'periodEndedAt')::TIMESTAMPTZ
          AND persisted.period_timezone = job->>'periodTimezone'
          AND persisted.period_key = job->>'periodKey'
          AND persisted.user_id IS NOT DISTINCT FROM NULLIF(job->>'userId', '')
          AND persisted.subscription_id IS NOT DISTINCT FROM
            NULLIF(job->>'subscriptionId', '')::UUID
          AND persisted.idempotency_key = job->>'idempotencyKey'
          AND persisted.requested_at = (job->>'requestedAt')::TIMESTAMPTZ
          AND persisted.started_at = (job->>'startedAt')::TIMESTAMPTZ
          AND (
            (persisted.status = 'RUNNING'
              AND persisted.completed_at IS NULL
              AND persisted.reader_summary_artifact_id IS NULL)
            OR
            (persisted.status =
                (publication->>'semanticStatus')::"SummaryStatus"
              AND persisted.completed_at =
                (publication->>'publishedAt')::TIMESTAMPTZ
              AND persisted.reader_summary_artifact_id =
                (publication->>'readerSummaryArtifactId')::UUID)
          )
          AND persisted.failed_at IS NULL
          AND persisted.failure_reason IS NULL
      ) AS "candidateExact"
  `;
  if (rows.length !== 1 || rows[0]?.candidateExact !== true) {
    throw new Error("Reader summary recovery candidate conflicts with durable state");
  }
};

export type ReaderSummaryDailyCanonicalRecoveryCapture = (
  input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput,
  prisma: PrismaReaderSummaryClient,
) => Promise<ReaderSummaryDailyCanonicalRecoveryCapturedPublication>;

export type ReaderSummaryDailyCanonicalRecoveryFinalizationInput = Readonly<{
  work: Readonly<{
    tenantId: string;
    workspaceId: string;
    requestedUtcDate:
      | "2026-07-23" | "2026-07-24" | "2026-07-25" | "2026-07-26"
      | "2026-07-27" | "2026-07-28" | "2026-07-29" | "2026-07-30";
    sourceAuthoritySha256: string;
    modelJobIdentity: string;
    attemptOrdinal?: 1 | 2;
    workerId: string;
    sourceAuthorityBytes: Buffer;
    state: "RESERVED" | "COMPLETED" | "PUBLICATION_PENDING" | "FINALIZED";
    fencingToken: bigint;
    leasedAt: string;
    leaseExpiresAt: string;
    absoluteExpiresAt: string;
    completedAt?: string;
    responseBytes?: Buffer;
    receiptBytes?: Buffer;
  }>;
  responseBytes: Buffer;
  receiptBytes: Buffer;
}>;

export type ReaderSummaryDailyCanonicalRecoveryCapturedPublication = Readonly<{
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  reportSha256: string;
  proofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceSha256: string;
  publicFrontendSha256: string;
  publicEvidenceBytes: Buffer;
  publicFrontendBytes: Buffer;
}>;

export type ReaderSummaryDailyCanonicalRecoveryStage = (
  input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput,
  publication: ReaderSummaryDailyCanonicalRecoveryCapturedPublication,
) => Promise<Readonly<{
  publish(): Promise<void>;
  cleanup(): Promise<void>;
}>>;

/**
 * Captures the private database publication and fences it as PUBLICATION_PENDING
 * in one serializable transaction. Files are staged privately and published only
 * after that commit; a second fenced transaction records FINALIZED after readback.
 */
export class PrismaReaderSummaryDailyCanonicalRecoveryV4Finalization {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly capture: ReaderSummaryDailyCanonicalRecoveryCapture,
    private readonly stage: ReaderSummaryDailyCanonicalRecoveryStage,
  ) {}

  async finalize(input: ReaderSummaryDailyCanonicalRecoveryFinalizationInput) {
    const modelJobIdentity = exactModelJobIdentity(input.work.modelJobIdentity);
    const attemptOrdinal = exactAttemptOrdinal(input.work.attemptOrdinal);
    const publication = await withPrismaWriteRetry(() =>
      runSerializableReaderSummaryTransaction(
        this.prisma,
        async (transaction) => {
          const captured = await this.capture(input, transaction);
          const provenanceVerified =
            await verifyReaderSummaryDailyCanonicalRecoveryV4Provenance({
              prisma: transaction,
              readerSummaryArtifactId: captured.readerSummaryArtifactId,
            });
          if (!provenanceVerified) {
            throw new Error(
              "Daily canonical recovery final publication provenance was not re-verified",
            );
          }
          const rows = await transaction.$queryRaw<readonly { sealed: boolean }[]>`
            SELECT public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
              ${input.work.tenantId}::UUID,
              ${input.work.workspaceId}::UUID,
              ${input.work.requestedUtcDate}::DATE,
              ${modelJobIdentity}::CHAR(64),
              ${attemptOrdinal}::SMALLINT,
              ${input.work.workerId}::TEXT,
              ${input.work.fencingToken}::BIGINT,
              ${captured.readerSummaryJobId}::UUID,
              ${captured.readerSummaryArtifactId}::UUID,
              ${captured.publicationId}::UUID,
              ${captured.reportSha256}::CHAR(64),
              ${captured.proofSha256}::CHAR(64),
              ${captured.weeklyEvidenceSha256}::CHAR(64),
              ${captured.publicEvidenceSha256}::CHAR(64),
              ${captured.publicFrontendSha256}::CHAR(64)
            ) AS sealed
          `;
          if (rows.length !== 1 || rows[0]?.sealed !== true) {
            throw new Error("Daily canonical recovery publication was not durably prepared");
          }
          return captured;
        },
        recoveryFinalizationTransactionOptions,
      ),
    );
    const staged = await this.stage(input, publication);
    try {
      await staged.publish();
      await withPrismaWriteRetry(() =>
        runSerializableReaderSummaryTransaction(
          this.prisma,
          async (transaction) => {
            const rows = await transaction.$queryRaw<readonly { sealed: boolean }[]>`
              SELECT public."finalize_reader_summary_daily_canonical_recovery_v4"(
                ${input.work.tenantId}::UUID,
                ${input.work.workspaceId}::UUID,
                ${input.work.requestedUtcDate}::DATE,
                ${modelJobIdentity}::CHAR(64),
                ${attemptOrdinal}::SMALLINT,
                ${input.work.workerId}::TEXT,
                ${input.work.fencingToken}::BIGINT,
                ${publication.readerSummaryJobId}::UUID,
                ${publication.readerSummaryArtifactId}::UUID,
                ${publication.publicationId}::UUID,
                ${publication.reportSha256}::CHAR(64),
                ${publication.proofSha256}::CHAR(64),
                ${publication.weeklyEvidenceSha256}::CHAR(64),
                ${publication.publicEvidenceSha256}::CHAR(64),
                ${publication.publicFrontendSha256}::CHAR(64)
              ) AS sealed
            `;
            if (rows.length !== 1 || rows[0]?.sealed !== true) {
              throw new Error("Daily canonical recovery finalization was not sealed");
            }
          },
          recoveryFinalizationTransactionOptions,
        ),
      );
    } catch (error) {
      // A DB client error after publish is ambiguous: the fenced FINALIZED
      // transaction could already have committed. Preserve immutable public
      // files so FINALIZED readback never points to missing evidence.
      await staged.cleanup();
      throw error;
    }
    await staged.cleanup();
    return Object.freeze({
      requestedUtcDate: input.work.requestedUtcDate,
      sourceAuthoritySha256: input.work.sourceAuthoritySha256,
      modelJobIdentity: input.work.modelJobIdentity,
      readerSummaryJobId: publication.readerSummaryJobId,
      readerSummaryArtifactId: publication.readerSummaryArtifactId,
      publicationId: publication.publicationId,
      reportSha256: publication.reportSha256,
      proofSha256: publication.proofSha256,
      weeklyEvidenceSha256: publication.weeklyEvidenceSha256,
      publicEvidenceSha256: publication.publicEvidenceSha256,
      publicFrontendSha256: publication.publicFrontendSha256,
    });
  }
}

const exactModelJobIdentity = (value: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Daily canonical recovery finalization lacks an exact model identity");
  }
  return value;
};

const exactAttemptOrdinal = (value: 1 | 2 | undefined): 1 | 2 => {
  if (value !== 1 && value !== 2) {
    throw new Error("Daily canonical recovery finalization lacks an exact attempt ordinal");
  }
  return value;
};
