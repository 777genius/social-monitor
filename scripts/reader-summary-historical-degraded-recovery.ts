import { resolve } from "node:path";

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
  installHistoricalDegradedRecoveryAuthority,
  prepareHistoricalDegradedRecoveryAuthority,
  readSecureHistoricalDegradedRecoveryFile,
  verifyHistoricalDegradedRecoveryAuthorityBytes,
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

type Command = "prepare" | "run" | "verify";

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
  const authorityPath = resolve(requiredOption(args, "--authority"));
  const files = readFiles(args);
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
            await verifier.capture({ requestedUtcDate: date, files, authorizedAt }),
          );
          const outcome = installHistoricalDegradedRecoveryAuthority({
            path: authorityPath,
            bytes: prepared.bytes,
          });
          console.log(`outcome=${outcome}`);
          console.log(`authority_sha256=${prepared.sha256}`);
          console.log(`authority_path=${authorityPath}`);
          return;
        }
        const authoritySha256 = requiredSha256(args, "--authority-sha256");
        const authorityBytes = readSecureHistoricalDegradedRecoveryFile(
          authorityPath,
          "authority",
        );
        const authority = verifyHistoricalDegradedRecoveryAuthorityBytes({
          bytes: authorityBytes,
          expectedSha256: authoritySha256,
        });
        if (authority.requestedUtcDate !== date) {
          throw new Error("Authority date does not match --date");
        }
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
          });
          await verifyPublishedRecovery(
            connection,
            authority,
            historicalDegradedRecoveryPublicationBinding(built.command),
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
            });
          },
        );
        const outcome = await executeHistoricalDegradedRecovery({
          authorityBytes,
          authoritySha256,
          files,
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

const readFiles = (args: readonly string[]): HistoricalDegradedRecoveryFiles => ({
  collectionArtifactBytes: readSecureHistoricalDegradedRecoveryFile(
    resolve(requiredOption(args, "--collection-artifact")),
    "collection artifact",
  ),
  collectionQualityReportBytes: readSecureHistoricalDegradedRecoveryFile(
    resolve(requiredOption(args, "--collection-quality-report")),
    "collection quality report",
  ),
  datasetManifestBytes: readSecureHistoricalDegradedRecoveryFile(
    resolve(requiredOption(args, "--dataset-manifest")),
    "dataset manifest",
  ),
});

const commandFrom = (value: string | undefined): Command => {
  if (value !== "prepare" && value !== "run" && value !== "verify") {
    throw new Error("Command must be prepare, run, or verify");
  }
  return value;
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

function recoveryHelpText(): string {
  return `Bounded Aug 18-19 historical degraded reader-summary recovery.

Generate fresh inputs first (inside a dedicated evidence directory):
  npm run capture:reader-summary-day-dataset-manifest -- --date DATE --recovery-root DIR --out DIR/DATE/dataset-manifest.json
  sha256sum DIR/DATE/dataset-manifest.json
  npm run check:yesterday-social-collection-quality -- --date DATE --update --historical-regeneration-current-snapshot --regeneration-dataset-manifest DIR/DATE/dataset-manifest.json --regeneration-dataset-manifest-sha256 MANIFEST_SHA --regeneration-tenant-id 00000000-0000-7000-8000-000000006101 --regeneration-workspace-id 00000000-0000-7000-8000-000000006102 --regeneration-timestamp-policy published_at
  install -m 0400 ops/evals/yesterday-social-collection-quality-report.v1.json DIR/DATE/collection-quality-report.json

The collection artifact is the immutable base-collection receipt (Aug 18: 205;
Aug 19: 226, including 10 X). It does not claim the post-backfill total. The
exact fresh dataset manifest plus its hash-bound quality report are the
authoritative final-data proof (Aug 18: 277; Aug 19: 303), while the authority's
rejected source job/artifact record hash binds the exact reused no-model-call
summary. Before prepare, the operator must separately retain and review the
immutable additive X-backfill receipt (72 for Aug 18; 77 new for Aug 19); the
closed generic recovery provenance schema has no collection-evidence-set field.

Prepare (read-only DB capture; create-only authority install):
  npm run reader-summary:historical-degraded-recovery -- prepare --date DATE --authority DIR/DATE/authority.json --collection-artifact FILE --collection-quality-report FILE --dataset-manifest FILE

Run (new job/artifact/publication only; same authority is idempotent):
  npm run reader-summary:historical-degraded-recovery -- run --date DATE --authority FILE --authority-sha256 SHA --collection-artifact FILE --collection-quality-report FILE --dataset-manifest FILE

Verify (read-only; rechecks live truth/files/source and public receipt):
  npm run reader-summary:historical-degraded-recovery -- verify --date DATE --authority FILE --authority-sha256 SHA --collection-artifact FILE --collection-quality-report FILE --dataset-manifest FILE

DATE is restricted to 2026-08-18 or 2026-08-19 and the production workspace/UTC daily scope is compiled in. This command is not scheduled.`;
}
