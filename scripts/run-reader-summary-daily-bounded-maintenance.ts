import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { PrismaReaderSummaryDailyExecutionCursor } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor";
import type {
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import { SystemClock } from "@social-monitor/shared-kernel";

import { loadDotenvIfPresent } from "./lib/env-file";
import { GrpcReaderSummaryDailySubscriptionRuntime } from "./lib/grpc-reader-summary-daily-subscription-runtime";
import {
  CanonicalReaderSummaryDailyPublicationFinalizer,
  type ReaderSummaryDailyCaptureResult,
} from "./lib/reader-summary-daily-publication-finalizer";
import {
  ReaderSummaryDailyJul31Aug3MaintenanceRunner,
  bindReaderSummaryDailyJul31Aug3ExactClaim,
  readerSummaryDailyJul31Aug3CollectionArgs,
  validateReaderSummaryDailyMaintenanceCollectionArtifact,
  type ReaderSummaryDailyBoundedMaintenanceDependencies,
} from "./lib/reader-summary-daily-bounded-maintenance";
import { readerSummaryDailyJul31Aug3MaintenanceBounds } from "./lib/reader-summary-daily-maintenance-bounds";
import { readReaderSummaryDailyMaintenanceCursorPreview } from "./lib/reader-summary-daily-maintenance-cursor-preview";
import {
  assertReaderSummaryDailyMaintenanceScope,
  readerSummaryDailyMaintenanceScope,
} from "./lib/reader-summary-daily-maintenance-scope";
import { createReaderSummaryDailyTerminalRuntimeConnection } from "./lib/reader-summary-daily-terminal-runtime-connection";
import { ReaderSummaryDailyTerminalRunner } from "./lib/reader-summary-daily-terminal-runner";
import {
  verifyClaimedProviderAuthority,
  type PersistedProviderRow,
} from "./run-reader-summary-daily-catch-up";

const authorizationDate = "2026-07-23";
const authorizationDateEnv = "READER_SUMMARY_DAILY_MAINTENANCE_AUTHORIZED_UTC_DATE";
const authorizationModelIdentityEnv =
  "READER_SUMMARY_DAILY_MAINTENANCE_MODEL_JOB_IDENTITY";
const authorizationAuthorityShaEnv =
  "READER_SUMMARY_DAILY_MAINTENANCE_AUTHORITY_SHA256";

export const runReaderSummaryDailyBoundedMaintenance = async (
  dependencies: ReaderSummaryDailyBoundedMaintenanceDependencies,
) => new ReaderSummaryDailyJul31Aug3MaintenanceRunner(dependencies).runOne();

export const assertReaderSummaryDailyBoundedMaintenanceAuthorization = (
  env: Readonly<Record<string, string | undefined>>,
): void => {
  if (requiredEnv(env, authorizationDateEnv) !== authorizationDate) {
    throw new Error("Reader summary daily maintenance authorization date must be 2026-07-23");
  }
  requiredSha(
    requiredEnv(env, authorizationModelIdentityEnv),
    "Reader summary daily maintenance model job identity",
  );
  requiredSha(
    requiredEnv(env, authorizationAuthorityShaEnv),
    "Reader summary daily maintenance authority",
  );
};

const main = async (): Promise<void> => {
  loadDotenvIfPresent(".env");
  assertReaderSummaryDailyBoundedMaintenanceAuthorization(process.env);
  assertReaderSummaryDailyMaintenanceScope({
    tenantId: requiredEnv(process.env, "READER_SUMMARY_DAILY_TENANT_ID"),
    workspaceId: requiredEnv(process.env, "READER_SUMMARY_DAILY_WORKSPACE_ID"),
  });
  const firstUnresolvedUtcDate = requiredEnv(
    process.env,
    "READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE",
  );
  if (
    firstUnresolvedUtcDate !==
    readerSummaryDailyJul31Aug3MaintenanceBounds.lowerInclusive
  ) {
    throw new Error("Reader summary daily bounded maintenance must begin at 2026-07-31");
  }
  const databaseUrl = requiredEnv(process.env, "DATABASE_URL");
  const collectionArtifactDirectory = resolve(requiredEnv(
    process.env,
    "READER_SUMMARY_DAILY_COLLECTION_ARTIFACT_DIRECTORY",
  ));
  const publicDirectory = resolve(requiredEnv(
    process.env,
    "READER_SUMMARY_DAILY_PUBLIC_DIRECTORY",
  ));
  const connection = createReaderSummaryDailyTerminalRuntimeConnection(process.env);
  const cursor = new PrismaReaderSummaryDailyExecutionCursor(connection.terminal);
  const workerId = `daily-bounded-maintenance-${randomUUID()}`;
  const runtimeClient = GrpcAgentRuntimeClient.connect({
    address: requiredEnv(process.env, "AGENT_RUNTIME_GRPC_ADDRESS"),
    clock: new SystemClock(),
    options: {
      timeoutMs: positiveInteger(process.env.AGENT_RUNTIME_GRPC_TIMEOUT_MS, 5_000),
      serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN?.trim() || undefined,
    },
  });
  const publication = new CanonicalReaderSummaryDailyPublicationFinalizer({
    publicDirectory,
    capture: (input) => captureCanonicalPublication({
      input,
      databaseUrl,
      query: async (sql, values) => {
        const client = await connection.auditor.connect();
        try {
          return (await client.query<Record<string, unknown>>(sql, [...values])).rows;
        } finally {
          client.release();
        }
      },
    }),
  });
  try {
    const result = await runReaderSummaryDailyBoundedMaintenance({
      collectionArtifactDirectory,
      readCursor: async () => {
        const client = await connection.auditor.connect();
        try {
          return readReaderSummaryDailyMaintenanceCursorPreview({
            reader: {
              query: async <TRow extends Record<string, unknown>>(
                sql: string,
                values: readonly unknown[],
              ) => {
                const result = await client.query<TRow>(sql, [...values]);
                return { rows: result.rows };
              },
            },
            scope: readerSummaryDailyMaintenanceScope,
            firstUnresolvedUtcDate,
          });
        } finally {
          client.release();
        }
      },
      collectExactDate: async ({ requestedUtcDate }) => {
        const result = spawnSync(
          "npm",
          readerSummaryDailyJul31Aug3CollectionArgs({
            requestedUtcDate,
            collectionArtifactDirectory,
          }),
          childOptions(),
        );
        if (result.error !== undefined) {
          throw new Error("Bounded maintenance collection could not start");
        }
        if (result.status !== 0) {
          throw new Error("Bounded maintenance collection failed");
        }
      },
      validateProviderEvidence: async ({ requestedUtcDate }) =>
        validateReaderSummaryDailyMaintenanceCollectionArtifact({
          collectionArtifactDirectory,
          requestedUtcDate,
        }),
      claimExactDate: bindReaderSummaryDailyJul31Aug3ExactClaim(cursor, { workerId }),
      validateClaimedAuthority: async ({ work, artifactPath }) => {
        const artifact = validateReaderSummaryDailyMaintenanceCollectionArtifact({
          collectionArtifactDirectory,
          requestedUtcDate: work.requestedUtcDate,
        });
        if (artifact.kind !== "authority_verified") return artifact;
        try {
          verifyClaimedProviderAuthority({
            work,
            artifactPath,
            persistedRows: await readPersistedProviderRows(connection, work),
          });
          return { kind: "authority_verified" as const };
        } catch {
          return {
            kind: "authority_blocked" as const,
            reasonCode: "provider_authority_invalid",
          };
        }
      },
      executeClaimed: async (work) => {
        const terminal = await new ReaderSummaryDailyTerminalRunner({
          cursor: claimedCursor(cursor, work),
          runtime: new GrpcReaderSummaryDailySubscriptionRuntime(runtimeClient),
          publication,
          now: () => new Date(),
        }).runOne({
          ...readerSummaryDailyMaintenanceScope,
          workerId,
          firstUnresolvedUtcDate: work.requestedUtcDate,
        });
        if (terminal.kind !== "completed" && terminal.kind !== "replayed") {
          throw new Error("Bounded maintenance terminal returned a non-executable state");
        }
        return terminal;
      },
    });
    console.log(JSON.stringify(result));
    if (result.outcome === "blocked") process.exitCode = 1;
  } finally {
    await connection.close();
  }
};

const readPersistedProviderRows = async (
  connection: ReturnType<typeof createReaderSummaryDailyTerminalRuntimeConnection>,
  work: ReaderSummaryDailyExecutionWork,
): Promise<readonly PersistedProviderRow[]> => {
  const client = await connection.auditor.connect();
  try {
    const result = await client.query<PersistedProviderRow>(
      `SELECT feed.provider_key AS "providerKey", feed.status::TEXT AS status
       FROM feed_items feed
       JOIN source_items source_item ON source_item.id = feed.source_item_id
       WHERE feed.tenant_id = $1::UUID
         AND feed.workspace_id = $2::UUID
         AND feed.published_at >= $3::DATE::TIMESTAMP AT TIME ZONE 'UTC'
         AND feed.published_at < ($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC'
         AND feed.observed_at <= $4::TIMESTAMPTZ
         AND source_item.created_at <= $4::TIMESTAMPTZ`,
      [
        work.tenantId,
        work.workspaceId,
        work.requestedUtcDate,
        work.sourceAuthority.ingestionCutoff,
      ],
    );
    return result.rows;
  } finally {
    client.release();
  }
};

const claimedCursor = (
  delegate: ReaderSummaryDailyExecutionCursorPort,
  work: ReaderSummaryDailyExecutionWork,
): ReaderSummaryDailyExecutionCursorPort => ({
  claimNext: async () => ({ kind: "claimed", work }),
  renewLease: (input) => delegate.renewLease(input),
  markRunning: (input) => delegate.markRunning(input),
  complete: (input) => delegate.complete(input),
  finalizePublication: (input) => delegate.finalizePublication(input),
});

type CaptureInput = Parameters<
  ConstructorParameters<typeof CanonicalReaderSummaryDailyPublicationFinalizer>[0]["capture"]
>[0];

const captureCanonicalPublication = async (params: {
  readonly input: CaptureInput;
  readonly databaseUrl: string;
  readonly query: (
    sql: string,
    values: readonly unknown[],
  ) => Promise<readonly Record<string, unknown>[]>;
}): Promise<ReaderSummaryDailyCaptureResult> => {
  const directory = mkdtempSync(join(tmpdir(), "reader-summary-daily-capture-"));
  const responsePath = join(directory, "response.json");
  const receiptPath = join(directory, "receipt.json");
  const authorityPath = join(directory, "authority.json");
  const evidencePath = join(directory, "evidence.json");
  const frontendPath = join(directory, "frontend.json");
  try {
    writeFileSync(responsePath, params.input.responseBytes, { mode: 0o400 });
    writeFileSync(receiptPath, params.input.receiptBytes, { mode: 0o400 });
    writeFileSync(
      authorityPath,
      Buffer.from(params.input.work.sourceAuthority.canonicalBytes),
      { mode: 0o400 },
    );
    const date = params.input.work.requestedUtcDate;
    const capture = spawnSync(process.execPath, [
      "-r", "ts-node/register", "-r", "tsconfig-paths/register",
      "scripts/capture-durable-reader-summary-from-postgres.ts",
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: params.databaseUrl,
        DURABLE_READER_SUMMARY_TENANT_ID: params.input.work.tenantId,
        DURABLE_READER_SUMMARY_WORKSPACE_ID: params.input.work.workspaceId,
        DURABLE_READER_SUMMARY_TIMEZONE: "UTC",
        DURABLE_READER_SUMMARY_CADENCE: "daily",
        DURABLE_READER_SUMMARY_PERIOD_STARTED_AT: `${date}T00:00:00.000Z`,
        DURABLE_READER_SUMMARY_PERIOD_ENDED_AT: nextUtcDate(date),
        DURABLE_READER_SUMMARY_MODEL: "agent-runtime",
        DURABLE_READER_SUMMARY_TOPIC_LABELER: "deterministic",
        DURABLE_READER_SUMMARY_EVIDENCE_PATH: evidencePath,
        DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH: frontendPath,
        DURABLE_READER_SUMMARY_DAILY_RESPONSE_PATH: responsePath,
        DURABLE_READER_SUMMARY_DAILY_RECEIPT_PATH: receiptPath,
        DURABLE_READER_SUMMARY_DAILY_AUTHORITY_PATH: authorityPath,
        DURABLE_READER_SUMMARY_DAILY_MODEL_JOB_IDENTITY:
          params.input.work.modelJob.value,
        OPENAI_API_KEY: "",
      },
      encoding: "utf8",
      timeout: 30 * 60 * 1_000,
    });
    if (capture.status !== 0) {
      throw new Error("Daily canonical capture failed");
    }
    const evidenceBytes = readFileSync(evidencePath);
    const frontendBytes = readFileSync(frontendPath);
    const evidence = JSON.parse(evidenceBytes.toString("utf8")) as {
      result?: { readerSummaryJobId?: string; readerSummaryId?: string };
    };
    const readerSummaryJobId = requiredText(
      evidence.result?.readerSummaryJobId,
      "canonical job id",
    );
    const readerSummaryArtifactId = requiredText(
      evidence.result?.readerSummaryId,
      "canonical artifact id",
    );
    const rows = await params.query(
      `SELECT publication.id::TEXT AS "publicationId",
        btrim(publication.report_sha256) AS "reportSha256",
        btrim(publication.proof_sha256) AS "proofSha256",
        btrim(weekly.canonical_sha256) AS "weeklyEvidenceSha256"
       FROM reader_summary_publications publication
       JOIN reader_summary_weekly_publication_evidence weekly
         ON weekly.publication_id = publication.id
       WHERE publication.tenant_id = $1::UUID
         AND publication.workspace_id = $2::UUID
         AND publication.reader_summary_job_id = $3::UUID
         AND publication.reader_summary_artifact_id = $4::UUID`,
      [
        params.input.work.tenantId,
        params.input.work.workspaceId,
        readerSummaryJobId,
        readerSummaryArtifactId,
      ],
    );
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error("Daily canonical DB publication was not read back exactly");
    }
    return {
      readerSummaryJobId,
      readerSummaryArtifactId,
      publicationId: requiredText(row.publicationId, "publication id"),
      reportSha256: requiredSha(row.reportSha256, "report"),
      proofSha256: requiredSha(row.proofSha256, "proof"),
      weeklyEvidenceSha256: requiredSha(row.weeklyEvidenceSha256, "weekly evidence"),
      evidenceBytes,
      frontendBytes,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const childOptions = () => ({
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8" as const,
  maxBuffer: 1024 * 1024,
});

const requiredEnv = (
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string => requiredText(env[name]?.trim(), name);

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
};

const requiredSha = (value: unknown, label: string): string => {
  const result = requiredText(value, label);
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw new Error(`${label} must be a lowercase SHA-256 hex value`);
  }
  return result;
};

const nextUtcDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("AGENT_RUNTIME_GRPC_TIMEOUT_MS must be positive");
  }
  return parsed;
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
