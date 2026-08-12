import { spawnSync, type SpawnSyncReturns } from "node:child_process";
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
  ReaderSummaryDailyClaimResult,
  ReaderSummaryDailyExecutionCursorPort,
  ReaderSummaryDailyExecutionWork,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";
import { SystemClock } from "@social-monitor/shared-kernel";

import { loadDotenvIfPresent } from "./lib/env-file";
import { GrpcReaderSummaryDailySubscriptionRuntime } from "./lib/grpc-reader-summary-daily-subscription-runtime";
import {
  ReaderSummaryDailyCatchUpSupervisor,
  type ReaderSummaryDailyCatchUpEvidence,
} from "./lib/reader-summary-daily-catch-up-supervisor";
import {
  CanonicalReaderSummaryDailyPublicationFinalizer,
  type ReaderSummaryDailyCaptureResult,
} from "./lib/reader-summary-daily-publication-finalizer";
import {
  collectionArtifactPassesBlockingValidation,
  readExactDayCollectionArtifact,
} from "./lib/reader-summary-clean-real-day-collection-artifact";
import { defaultCleanRealDayCollectionProviderKeys } from "./lib/clean-real-day-collection-report";
import { verifyReaderSummaryDailySourceAuthority } from "./lib/reader-summary-daily-source-authority-snapshot";
import { createReaderSummaryDailyTerminalRuntimeConnection } from "./lib/reader-summary-daily-terminal-runtime-connection";
import { ReaderSummaryDailyTerminalRunner } from "./lib/reader-summary-daily-terminal-runner";

type Spawn = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: "utf8";
    maxBuffer: number;
  }>,
) => SpawnSyncReturns<string>;

export type ReaderSummaryDailyCatchUpRuntime = Readonly<{
  claimNext(): Promise<ReaderSummaryDailyClaimResult>;
  readPersistedRows(
    work: ReaderSummaryDailyExecutionWork,
  ): Promise<readonly PersistedProviderRow[]>;
  executeClaimed(
    work: ReaderSummaryDailyExecutionWork,
  ): Promise<Readonly<{ kind: "completed" | "replayed"; requestedUtcDate: string }>>;
  spawn: Spawn;
  env: NodeJS.ProcessEnv;
  cwd: string;
}>;

export const runReaderSummaryDailyCatchUp = async (
  runtime: ReaderSummaryDailyCatchUpRuntime,
): Promise<ReaderSummaryDailyCatchUpEvidence> =>
  new ReaderSummaryDailyCatchUpSupervisor({
    claimOldest: runtime.claimNext,
    verifyProviders: async (work) => {
      const artifactPath =
        runtime.env.READER_SUMMARY_DAILY_COLLECTION_REPORT_PATH ??
        "ops/evals/reader-summary-clean-real-day-collection.v1.json";
      try {
        verifyReaderSummaryDailySourceAuthority({
          tenantId: work.tenantId,
          workspaceId: work.workspaceId,
          requestedUtcDate: work.requestedUtcDate,
          authority: work.sourceAuthority,
        });
      } catch {
        return {
          kind: "authority_blocked" as const,
          reasonCode: "persisted_authority_invalid",
        };
      }
      const result = runtime.spawn(
        "npm",
        providerCatchUpArgs(work.requestedUtcDate),
        childOptions(runtime),
      );
      if (result.error !== undefined) {
        return {
          kind: "authority_blocked" as const,
          reasonCode: "provider_catch_up_start_failed",
        };
      }
      let persistedRows: readonly PersistedProviderRow[];
      try {
        persistedRows = await runtime.readPersistedRows(work);
      } catch {
        return {
          kind: "authority_blocked" as const,
          reasonCode: "persisted_authority_read_failed",
        };
      }
      const verification = await classifyClaimedProviderAuthority({
        work,
        artifactPath,
        persistedRows,
      });
      if (verification !== "verified") return verification;
      if (result.status !== 0) {
        return {
          kind: "authority_blocked" as const,
          reasonCode: "provider_catch_up_failed_with_evidence",
        };
      }
      return { kind: "authority_verified" as const };
    },
    executeClaimed: runtime.executeClaimed,
  }).run();

export const providerCatchUpArgs = (requestedUtcDate: string): readonly string[] => [
  "run",
  "run:reader-summary-clean-real-day-collection",
  "--",
  "--update",
  "--date",
  requestedUtcDate,
  "--provider-catch-up",
  "--wait-for-x-readiness",
];

export const verifyClaimedProviderAuthority = (params: Readonly<{
  work: ReaderSummaryDailyExecutionWork;
  artifactPath: string;
  persistedRows?: readonly PersistedProviderRow[];
}>): void => {
  const authority = verifyReaderSummaryDailySourceAuthority({
    tenantId: params.work.tenantId,
    workspaceId: params.work.workspaceId,
    requestedUtcDate: params.work.requestedUtcDate,
    authority: params.work.sourceAuthority,
  });
  const report = readExactDayCollectionArtifact({
    path: params.artifactPath,
    collectionDate: params.work.requestedUtcDate,
  });
  if (report === null) {
    throw new Error("Provider catch-up did not return exact day evidence");
  }
  if (!collectionArtifactPassesBlockingValidation(report)) {
    throw new Error("Provider catch-up returned invalid exact day evidence");
  }
  const authorityCounts = Object.fromEntries(
    defaultCleanRealDayCollectionProviderKeys.map((providerKey) => [
      providerKey,
      authority.items.filter((item) => item.providerKey === providerKey).length,
    ]),
  );
  if (params.persistedRows !== undefined) {
    assertVisibleProviderAuthority(params.persistedRows, authorityCounts);
  }
};

export type PersistedProviderRow = Readonly<{
  providerKey: string;
  status: "VISIBLE" | "HIDDEN" | "TOMBSTONED";
}>;

export const visibleProviderCounts = (
  rows: readonly PersistedProviderRow[],
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.status === "VISIBLE") {
      counts[row.providerKey] = (counts[row.providerKey] ?? 0) + 1;
    }
  }
  return counts;
};

export const assertVisibleProviderAuthority = (
  rows: readonly PersistedProviderRow[],
  authorityCounts: Readonly<Record<string, number>>,
): void => {
  const visibleCounts = visibleProviderCounts(rows);
  const providerKeys = new Set([
    ...Object.keys(authorityCounts),
    ...Object.keys(visibleCounts),
  ]);
  for (const providerKey of providerKeys) {
    if ((visibleCounts[providerKey] ?? 0) !== (authorityCounts[providerKey] ?? 0)) {
      throw new Error("Visible provider counts diverged from immutable authority");
    }
  }
};

const classifyClaimedProviderAuthority = async (params: Readonly<{
  work: ReaderSummaryDailyExecutionWork;
  artifactPath: string;
  persistedRows: readonly PersistedProviderRow[];
}>): Promise<
  | "verified"
  | Readonly<{ kind: "provider_deferred"; reasonCode: string }>
  | Readonly<{ kind: "authority_blocked"; reasonCode: string }>
> => {
  try {
    verifyClaimedProviderAuthority(params);
    return "verified";
  } catch (error) {
    if (error instanceof Error &&
        error.message === "Provider catch-up did not return exact day evidence") {
      return { kind: "provider_deferred", reasonCode: "exact_day_evidence_absent" };
    }
    return { kind: "authority_blocked", reasonCode: "provider_authority_invalid" };
  }
};

const main = async (): Promise<void> => {
  loadDotenvIfPresent(".env");
  const tenantId = requiredEnv("READER_SUMMARY_DAILY_TENANT_ID");
  const workspaceId = requiredEnv("READER_SUMMARY_DAILY_WORKSPACE_ID");
  const firstUnresolvedUtcDate = requiredUtcDate(
    "READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE",
  );
  const databaseUrl = requiredEnv("DATABASE_URL");
  const publicDirectory = resolve(requiredEnv(
    "READER_SUMMARY_DAILY_PUBLIC_DIRECTORY",
  ));
  const connection = createReaderSummaryDailyTerminalRuntimeConnection(process.env);
  const cursor = new PrismaReaderSummaryDailyExecutionCursor(connection.terminal);
  const workerId = `daily-catch-up-${randomUUID()}`;
  const runtimeClient = GrpcAgentRuntimeClient.connect({
    address: requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
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
    const result = await runReaderSummaryDailyCatchUp({
      claimNext: () => cursor.claimNext({
        tenantId,
        workspaceId,
        workerId,
        firstUnresolvedUtcDate,
        invokedAt: new Date().toISOString(),
      }),
      readPersistedRows: async (work) => {
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
            [work.tenantId, work.workspaceId, work.requestedUtcDate,
              work.sourceAuthority.ingestionCutoff],
          );
          return result.rows;
        } finally {
          client.release();
        }
      },
      executeClaimed: async (work) => {
        const terminal = await new ReaderSummaryDailyTerminalRunner({
          cursor: claimedCursor(cursor, work),
          runtime: new GrpcReaderSummaryDailySubscriptionRuntime(runtimeClient),
          publication,
          now: () => new Date(),
        }).runOne({
          tenantId,
          workspaceId,
          workerId,
          firstUnresolvedUtcDate: work.requestedUtcDate,
        });
        if (terminal.kind !== "completed" && terminal.kind !== "replayed") {
          throw new Error("Claimed daily terminal returned a non-executable state");
        }
        return terminal;
      },
      spawn: (command, args, options) => spawnSync(command, [...args], options),
      env: process.env,
      cwd: process.cwd(),
    });
    console.log(JSON.stringify(result));
    if (result.outcome === "blocked") process.exitCode = 1;
  } finally {
    await connection.close();
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
    writeFileSync(authorityPath,
      Buffer.from(params.input.work.sourceAuthority.canonicalBytes), { mode: 0o400 });
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
      evidence.result?.readerSummaryJobId, "canonical job id");
    const readerSummaryArtifactId = requiredText(
      evidence.result?.readerSummaryId, "canonical artifact id");
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
      [params.input.work.tenantId, params.input.work.workspaceId,
        readerSummaryJobId, readerSummaryArtifactId],
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

const childOptions = (runtime: Pick<ReaderSummaryDailyCatchUpRuntime,
  "cwd" | "env">) => ({
  cwd: runtime.cwd,
  env: runtime.env,
  encoding: "utf8" as const,
  maxBuffer: 1024 * 1024,
});
const requiredEnv = (name: string): string => requiredText(
  process.env[name]?.trim(), name);
const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
};
const requiredSha = (value: unknown, label: string): string => {
  const result = requiredText(value, `${label} SHA-256`);
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new Error(`${label} SHA-256 is invalid`);
  return result;
};
const requiredUtcDate = (name: string): string => {
  const value = requiredEnv(name);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be an exact UTC date`);
  }
  return value;
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
  void main().catch(() => {
    console.error("reader-summary-daily-catch-up failed");
    process.exitCode = 1;
  });
}
