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
import { SystemClock } from "@social-monitor/shared-kernel";

import { loadDotenvIfPresent } from "./lib/env-file";
import { GrpcReaderSummaryDailySubscriptionRuntime } from "./lib/grpc-reader-summary-daily-subscription-runtime";
import {
  CanonicalReaderSummaryDailyPublicationFinalizer,
  type ReaderSummaryDailyCaptureResult,
} from "./lib/reader-summary-daily-publication-finalizer";
import { createReaderSummaryDailyTerminalRuntimeConnection } from "./lib/reader-summary-daily-terminal-runtime-connection";
import { ReaderSummaryDailyTerminalRunner } from "./lib/reader-summary-daily-terminal-runner";

loadDotenvIfPresent(".env");

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const tenantId = requiredEnv("READER_SUMMARY_DAILY_TENANT_ID");
  const workspaceId = requiredEnv("READER_SUMMARY_DAILY_WORKSPACE_ID");
  const firstUnresolvedUtcDate = requiredUtcDate(
    "READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE",
  );
  const databaseUrl = requiredEnv("DATABASE_URL");
  const runtimeConnection = createReaderSummaryDailyTerminalRuntimeConnection(
    process.env,
  );
  const cursor = new PrismaReaderSummaryDailyExecutionCursor(
    runtimeConnection.terminal,
  );
  const runtimeClient = GrpcAgentRuntimeClient.connect({
    address: requiredEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
    clock: new SystemClock(),
    options: {
      timeoutMs: positiveInteger(
        process.env.AGENT_RUNTIME_GRPC_TIMEOUT_MS,
        5_000,
      ),
      serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN?.trim() || undefined,
    },
  });
  const publication = new CanonicalReaderSummaryDailyPublicationFinalizer({
    publicDirectory: resolve(requiredEnv(
      "READER_SUMMARY_DAILY_PUBLIC_DIRECTORY",
    )),
    capture: (input) => captureCanonicalPublication({
      input,
      databaseUrl,
      query: async (sql, values) => {
        const client = await runtimeConnection.auditor.connect();
        try {
          return (await client.query<Record<string, unknown>>(
            sql,
            [...values],
          )).rows;
        } finally {
          client.release();
        }
      },
    }),
  });
  try {
    const result = await new ReaderSummaryDailyTerminalRunner({
      cursor,
      runtime: new GrpcReaderSummaryDailySubscriptionRuntime(runtimeClient),
      publication,
      now: () => new Date(),
    }).runOne({
      tenantId,
      workspaceId,
      workerId: `daily-terminal-${randomUUID()}`,
      firstUnresolvedUtcDate,
    });
    console.log(`reader-summary-daily-terminal outcome=${result.kind}`);
    if ("requestedUtcDate" in result) {
      console.log(`requested_utc_date=${result.requestedUtcDate}`);
    }
  } finally {
    await runtimeConnection.close();
  }
}

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
    const childEnv = {
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
    };
    const capture = spawnSync(
      process.execPath,
      [
        "-r", "ts-node/register",
        "-r", "tsconfig-paths/register",
        "scripts/capture-durable-reader-summary-from-postgres.ts",
      ],
      {
        cwd: process.cwd(),
        env: childEnv,
        encoding: "utf8",
        timeout: 30 * 60 * 1_000,
      },
    );
    if (capture.status !== 0) {
      throw new Error(
        `Daily canonical capture failed: ${capture.stderr.trim() || "unknown"}`,
      );
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
      weeklyEvidenceSha256: requiredSha(
        row.weeklyEvidenceSha256,
        "weekly evidence",
      ),
      evidenceBytes,
      frontendBytes,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const requiredEnv = (name: string): string =>
  requiredText(process.env[name]?.trim(), name);

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value;
};

const requiredSha = (value: unknown, label: string): string => {
  const result = requiredText(value, `${label} SHA-256`);
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw new Error(`${label} SHA-256 is invalid`);
  }
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
