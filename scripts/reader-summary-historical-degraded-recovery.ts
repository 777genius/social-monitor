import {
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
} from "@social-monitor/platform-persistence";
import {
  PrismaReaderSummaryRecoveryFinalization,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-recovery-finalization";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  historicalDegradedRecoveryTenantId,
  historicalDegradedRecoveryWorkspaceId,
  assertHistoricalDegradedRecoveryXBackfillReceipt,
  historicalDegradedRecoveryEvidencePath,
  installHistoricalDegradedRecoveryEvidence,
  installHistoricalDegradedRecoveryAuthority,
  prepareHistoricalDegradedRecoveryAuthority,
  readSecureHistoricalDegradedRecoveryFile,
  sha256,
  verifyHistoricalDegradedRecoveryAuthorityBytes,
  verifyHistoricalDegradedRecoveryXBackfillReceiptBytes,
  type HistoricalDegradedRecoveryEvidenceArtifact,
} from "./lib/reader-summary-historical-degraded-recovery-authority";
import {
  buildHistoricalDegradedRecoveryCommand,
  executeHistoricalDegradedRecovery,
  recoveryIdentities,
  type HistoricalDegradedRecoveryFiles,
} from "./lib/reader-summary-historical-degraded-recovery-execution";
import { PrismaHistoricalDegradedRecoveryLiveVerifier } from "./lib/reader-summary-historical-degraded-recovery-live";
import {
  historicalDegradedRecoveryPublicationBinding,
  type HistoricalDegradedRecoveryPublicationBinding,
} from "./lib/reader-summary-historical-degraded-recovery-slot";

export type HistoricalDegradedRecoveryCliCommand =
  | "install-input"
  | "prepare"
  | "run"
  | "verify";
type RecoveryInputArtifact = Exclude<
  HistoricalDegradedRecoveryEvidenceArtifact,
  "authority"
>;

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.length === 0) {
    console.log(recoveryHelpText());
    return;
  }
  const command = commandFrom(args[0]);
  const date = requiredOption(args, "--date");
  assertAllowedDate(date);
  assertHistoricalDegradedRecoveryCliArguments(args, command);
  if (command === "install-input") {
    const artifact = recoveryInputArtifact(
      requiredOption(args, "--artifact"),
    );
    const bytes = await readBoundedStandardInput();
    if (artifact === "x-backfill-receipt") {
      verifyHistoricalDegradedRecoveryXBackfillReceiptBytes({
        requestedUtcDate: date,
        bytes,
      });
    }
    const outcome = installHistoricalDegradedRecoveryEvidence({
      requestedUtcDate: date,
      artifact,
      bytes,
    });
    console.log(`outcome=${outcome}`);
    console.log(`artifact_sha256=${sha256(bytes)}`);
    console.log(
      `artifact_path=${historicalDegradedRecoveryEvidencePath(date, artifact)}`,
    );
    return;
  }
  const authorityPath = historicalDegradedRecoveryEvidencePath(
    date,
    "authority",
  );
  const { files, xBackfillReceiptBytes } = readFiles(date);
  loadDotenvIfPresent(".env");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "daily-runner"),
  );
  try {
    await runWithTenantDatabaseAccess(
      {
        tenantId: historicalDegradedRecoveryTenantId,
        workspaceId: historicalDegradedRecoveryWorkspaceId,
      },
      async () => {
        const verifier = new PrismaHistoricalDegradedRecoveryLiveVerifier(connection);
        if (command === "prepare") {
          const authorizedAt = new Date();
          const prepared = prepareHistoricalDegradedRecoveryAuthority(
            {
              ...await verifier.capture({
                requestedUtcDate: date,
                files,
                authorizedAt,
              }),
              xBackfillReceiptBytes,
            },
          );
          const outcome = installHistoricalDegradedRecoveryAuthority({
            requestedUtcDate: date,
            bytes: prepared.bytes,
          });
          console.log(`outcome=${outcome}`);
          console.log(`authority_sha256=${prepared.sha256}`);
          console.log(`authority_path=${authorityPath}`);
          return;
        }
        const authoritySha256 = requiredSha256(args, "--authority-sha256");
        const authorityBytes = readSecureHistoricalDegradedRecoveryFile(
          date,
          "authority",
        );
        const authority = verifyHistoricalDegradedRecoveryAuthorityBytes({
          bytes: authorityBytes,
          expectedSha256: authoritySha256,
        });
        if (authority.requestedUtcDate !== date) {
          throw new Error("Authority date does not match --date");
        }
        assertHistoricalDegradedRecoveryXBackfillReceipt({
          authority,
          bytes: xBackfillReceiptBytes,
        });
        if (command === "verify") {
          const live = await verifier.verify({ authority, authoritySha256, files });
          const built = buildHistoricalDegradedRecoveryCommand({
            authority,
            authoritySha256,
            live,
          });
          await verifier.verifyPublicationSlot({
            authority,
            authoritySha256,
            command: built.command,
            files,
            preflightAt: new Date(),
          });
          await verifyPublishedRecovery(
            connection,
            authority,
            historicalDegradedRecoveryPublicationBinding(
              built.command,
              authority.requestedUtcDate,
            ),
          );
          console.log("outcome=verified");
          console.log(`attempt_identity=${authority.attempt.identity}`);
          return;
        }
        const finalization = new PrismaReaderSummaryRecoveryFinalization(
          connection,
          async (transaction, command) => {
            const guarded = new PrismaHistoricalDegradedRecoveryLiveVerifier(
              transaction,
            );
            await guarded.verify({ authority, authoritySha256, files });
            await guarded.verifyPublicationSlot({
              authority,
              authoritySha256,
              command,
              files,
              preflightAt: new Date(),
            });
          },
        );
        const outcome = await executeHistoricalDegradedRecovery({
          authorityBytes,
          authoritySha256,
          files,
          preflightAt: new Date(),
          liveVerifier: verifier,
          finalization,
        });
        console.log(`outcome=${outcome.outcome}`);
        console.log(`attempt_identity=${outcome.attemptIdentity}`);
        console.log(`reader_summary_job_id=${outcome.readerSummaryJobId}`);
        console.log(`reader_summary_artifact_id=${outcome.readerSummaryArtifactId}`);
      },
    );
  } finally {
    await connection.close();
  }
}

const verifyPublishedRecovery = async (
  client: PrismaSummaryConnection,
  authority: ReturnType<typeof verifyHistoricalDegradedRecoveryAuthorityBytes>,
  binding: HistoricalDegradedRecoveryPublicationBinding,
): Promise<void> => {
  const identities = recoveryIdentities(authority.attempt.identity);
  const rows = await client.$queryRaw<readonly Readonly<{
    publicationCount: number;
    receiptCount: number;
    outboxCount: number;
    originalJobStatus: string;
    originalArtifactStatus: string;
    qualityFlags: unknown;
    githubMode: string | null;
  }>[]>`
    SELECT
      count(DISTINCT publication.id)::INTEGER AS "publicationCount",
      count(DISTINCT receipt.publication_id)::INTEGER AS "receiptCount",
      count(DISTINCT event.id)::INTEGER AS "outboxCount",
      max(source_job.status::TEXT) AS "originalJobStatus",
      max(source_artifact.status::TEXT) AS "originalArtifactStatus",
      min((recovered_artifact.quality_signals->'qualityFlags')::TEXT)::JSONB
        AS "qualityFlags",
      max(recovered_artifact.quality_signals->'githubProjectionAudit'
        ->'historicalOmission'->>'mode') AS "githubMode"
    FROM reader_summary_publications AS publication
    JOIN reader_summary_recovery_receipts AS receipt
      ON receipt.publication_id = publication.id
    JOIN reader_summary_artifacts AS recovered_artifact
      ON recovered_artifact.id = publication.reader_summary_artifact_id
    JOIN reader_summary_jobs AS recovered_job
      ON recovered_job.id = publication.reader_summary_job_id
     AND recovered_job.tenant_id = publication.tenant_id
     AND recovered_job.workspace_id = publication.workspace_id
    JOIN reader_summary_jobs AS source_job
      ON source_job.id = ${authority.source.jobId}::UUID
    JOIN reader_summary_artifacts AS source_artifact
      ON source_artifact.id = ${authority.source.artifactId}::UUID
    JOIN outbox_events AS event ON event.id = publication.outbox_event_id
    WHERE publication.id = ${identities.artifactId}::UUID
      AND publication.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
      AND publication.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
      AND publication.reader_summary_job_id = ${binding.readerSummaryJobId}::UUID
      AND publication.reader_summary_artifact_id = ${binding.readerSummaryArtifactId}::UUID
      AND publication.outbox_event_id = ${binding.outboxEventId}::UUID
      AND publication.period_key = ${binding.periodKey}
      AND publication.requested_utc_date = ${binding.requestedUtcDate}::DATE
      AND publication.publication_kind = 'EXACT'
      AND publication.semantic_status = ${binding.semanticStatus}::"SummaryStatus"
      AND publication.requested_at = ${binding.requestedAt}::TIMESTAMPTZ
      AND publication.model_version = ${binding.modelVersion}
      AND publication.report_sha256 = ${binding.reportSha256}
      AND publication.proof_sha256 = ${binding.proofSha256}
      AND publication.exact_proof = ${binding.exactProofJson}::JSONB
      AND publication.published_at = ${binding.publishedAt}::TIMESTAMPTZ
      AND recovered_job.status = 'COMPLETED'
      AND recovered_job.completed_at = ${binding.publishedAt}::TIMESTAMPTZ
      AND recovered_job.reader_summary_artifact_id =
        ${binding.readerSummaryArtifactId}::UUID
      AND recovered_artifact.status = 'COMPLETED'
      AND event.message_kind = 'EVENT'
      AND event.event_type = ${binding.outboxEventType}
      AND event.schema_version = ${binding.outboxSchemaVersion}
      AND event.tenant_id = ${binding.outboxTenantId}::UUID
      AND event.workspace_id = ${binding.outboxWorkspaceId}::UUID
      AND event.payload = ${binding.outboxPayloadJson}::JSONB
      AND event.correlation_id = ${binding.outboxCorrelationId}
      AND event.causation_id = ${binding.outboxCausationId}
      AND event.created_at = ${binding.outboxCreatedAt}::TIMESTAMPTZ
      AND receipt.reader_summary_job_id = ${binding.readerSummaryJobId}::UUID
      AND receipt.reader_summary_artifact_id = ${binding.readerSummaryArtifactId}::UUID
      AND receipt.tenant_id = ${historicalDegradedRecoveryTenantId}::UUID
      AND receipt.workspace_id = ${historicalDegradedRecoveryWorkspaceId}::UUID
      AND receipt.recovery_kind = 'SUMMARY_ONLY'
      AND receipt.provenance = ${binding.provenanceJson}::JSONB
      AND receipt.provenance_sha256 = ${binding.provenanceSha256}
      AND receipt.exact_receipt = ${binding.exactReceiptJson}::JSONB
      AND receipt.receipt_sha256 = ${binding.receiptSha256}
      AND receipt.recorded_at = ${binding.publishedAt}::TIMESTAMPTZ
  `;
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row?.publicationCount !== 1 ||
    row.receiptCount !== 1 ||
    row.outboxCount !== 1 ||
    row.originalJobStatus !== "REJECTED" ||
    row.originalArtifactStatus !== "REJECTED" ||
    JSON.stringify(row.qualityFlags) !== JSON.stringify(["limited_sources"]) ||
    row.githubMode !== "github_projection_unavailable_historical"
  ) {
    throw new Error("Historical degraded recovery publication verification failed");
  }
};

const readFiles = (requestedUtcDate: string): Readonly<{
  files: HistoricalDegradedRecoveryFiles;
  xBackfillReceiptBytes: Buffer;
}> => {
  const xBackfillReceiptBytes = readSecureHistoricalDegradedRecoveryFile(
    requestedUtcDate,
    "x-backfill-receipt",
  );
  return {
    files: {
    collectionArtifactBytes: readSecureHistoricalDegradedRecoveryFile(
      requestedUtcDate,
      "collection-artifact",
    ),
    collectionQualityReportBytes: readSecureHistoricalDegradedRecoveryFile(
      requestedUtcDate,
      "collection-quality-report",
    ),
    datasetManifestBytes: readSecureHistoricalDegradedRecoveryFile(
      requestedUtcDate,
      "dataset-manifest",
    ),
      xBackfillReceiptBytes,
    },
    xBackfillReceiptBytes,
  };
};

const commandFrom = (
  value: string | undefined,
): HistoricalDegradedRecoveryCliCommand => {
  if (
    value !== "install-input" &&
    value !== "prepare" &&
    value !== "run" &&
    value !== "verify"
  ) {
    throw new Error("Command must be install-input, prepare, run, or verify");
  }
  return value;
};

const recoveryInputArtifact = (value: string): RecoveryInputArtifact => {
  if (
    value !== "collection-artifact" &&
    value !== "collection-quality-report" &&
    value !== "dataset-manifest" &&
    value !== "x-backfill-receipt"
  ) {
    throw new Error(
      "--artifact must be collection-artifact, collection-quality-report, dataset-manifest, or x-backfill-receipt",
    );
  }
  return value;
};

export const assertHistoricalDegradedRecoveryCliArguments = (
  args: readonly string[],
  command: HistoricalDegradedRecoveryCliCommand,
): void => {
  const allowed = new Set(
    command === "install-input"
      ? ["--date", "--artifact"]
      : command === "prepare"
        ? ["--date"]
        : ["--date", "--authority-sha256"],
  );
  const seen = new Set<string>();
  for (let index = 1; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      option === undefined ||
      !allowed.has(option) ||
      seen.has(option) ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error(
        `${command} received an unsupported, duplicate, or incomplete option`,
      );
    }
    seen.add(option);
  }
  if (seen.size !== allowed.size) {
    throw new Error(`${command} requires exactly ${[...allowed].join(" and ")}`);
  }
};

const readBoundedStandardInput = async (): Promise<Buffer> => {
  const maximumBytes = 64 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBytes) {
      throw new Error("Recovery evidence stdin exceeds 64 MiB");
    }
    chunks.push(bytes);
  }
  if (size === 0) throw new Error("Recovery evidence stdin must not be empty");
  return Buffer.concat(chunks, size);
};

const assertAllowedDate = (value: string): void => {
  if (value !== "2026-08-18" && value !== "2026-08-19") {
    throw new Error("--date must be exactly 2026-08-18 or 2026-08-19");
  }
};

const requiredOption = (args: readonly string[], name: string): string => {
  const positions = args.flatMap((arg, index) => arg === name ? [index] : []);
  const value = positions.length === 1 ? args[positions[0]! + 1]?.trim() : undefined;
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${name} must be supplied exactly once`);
  }
  return value;
};

const requiredSha256 = (args: readonly string[], name: string): string => {
  const value = requiredOption(args, name);
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error(`${name} must be a lowercase SHA-256`);
  return value;
};

const requiredEnv = (name: string): string => {
  const value = optionalEnv(name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
};

const optionalEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

export function recoveryHelpText(): string {
  return `Bounded Aug 18-19 historical degraded reader-summary recovery.

This command must run as effective uid 1000. Evidence lives only below
/var/lib/social-monitor/artifacts/reader-summary/historical-degraded-recovery/DATE.
The fixed evidence root must already be uid 1000 mode 0700. Descendant
directories are descriptor-anchored uid 1000 mode 0700; files are create-only,
uid 1000 mode 0400, fsynced, non-symlink regular files.

Create the fresh dataset manifest directly in the fixed evidence root:
  npm run capture:reader-summary-day-dataset-manifest -- --date DATE

Install every other immutable input create-only from stdin (max 64 MiB):
  npm run reader-summary:historical-degraded-recovery -- install-input --date DATE --artifact collection-artifact < COLLECTION_ARTIFACT
  npm run reader-summary:historical-degraded-recovery -- install-input --date DATE --artifact collection-quality-report < COLLECTION_QUALITY_REPORT
  npm run reader-summary:historical-degraded-recovery -- install-input --date DATE --artifact x-backfill-receipt < X_BACKFILL_RECEIPT

The collection artifact is the immutable base-collection receipt (Aug 18: 205;
Aug 19: 226, including 10 X). It does not claim the post-backfill total. The
exact fresh dataset manifest plus its hash-bound quality report are the
authoritative final-data proof (Aug 18: 277; Aug 19: 303), while the authority's
rejected source job/artifact record hash binds the exact reused no-model-call
summary. The immutable additive X-backfill receipt is mandatory (72 rows for
Aug 18; 77 new rows for Aug 19). Its exact bytes and compiled row count are
bound into authority v2; the authority SHA-256 then binds it transitively into
the closed recovery provenance sourceAttempt.

Prepare (read-only DB capture; create-only authority install):
  npm run reader-summary:historical-degraded-recovery -- prepare --date DATE

Run (new job/artifact/publication only; same authority is idempotent):
  npm run reader-summary:historical-degraded-recovery -- run --date DATE --authority-sha256 SHA

Verify (read-only; rechecks live truth/files/source and public receipt):
  npm run reader-summary:historical-degraded-recovery -- verify --date DATE --authority-sha256 SHA

DATE is restricted to 2026-08-18 or 2026-08-19 and the production workspace/UTC daily scope is compiled in. This command is not scheduled.`;
}
