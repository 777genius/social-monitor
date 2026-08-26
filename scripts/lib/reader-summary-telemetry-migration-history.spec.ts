import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  classifyReaderSummaryTelemetryMigrationHistory,
  type ReaderSummaryTelemetryMigrationRow,
  readerSummaryTelemetryCorrectedChecksum,
  readerSummaryTelemetryOldChecksum,
  reviewedTelemetryFailureLog,
} from "./reader-summary-telemetry-migration-history";

const started = "2026-08-24T12:00:00.000Z";
const rolledBack = "2026-08-24T12:01:00.000Z";
const correctedStarted = "2026-08-24T12:02:00.000Z";
const correctedFinished = "2026-08-24T12:03:00.000Z";

const failedRow = (): ReaderSummaryTelemetryMigrationRow => ({
  applied_steps_count: 0,
  checksum: readerSummaryTelemetryOldChecksum,
  finished_at: null,
  id: "00000000-0000-4000-8000-000000000001",
  logs: reviewedTelemetryFailureLog.replace(
    "line: Some(<server-line>)", "line: Some(3655)",
  ),
  rolled_back_at: null,
  started_at: started,
});

const correctedRow = (): ReaderSummaryTelemetryMigrationRow => ({
  applied_steps_count: 1,
  checksum: readerSummaryTelemetryCorrectedChecksum,
  finished_at: correctedFinished,
  id: "00000000-0000-4000-8000-000000000002",
  logs: null,
  rolled_back_at: null,
  started_at: correctedStarted,
});

describe("reader summary telemetry migration history", () => {
  it("classifies only the exact reviewed lifecycles", () => {
    const resolved = { ...failedRow(), rolled_back_at: rolledBack };
    expect(classifyReaderSummaryTelemetryMigrationHistory([])).toBe("clean");
    expect(classifyReaderSummaryTelemetryMigrationHistory([failedRow()]))
      .toBe("recovery-required");
    expect(classifyReaderSummaryTelemetryMigrationHistory([resolved]))
      .toBe("resolved");
    expect(classifyReaderSummaryTelemetryMigrationHistory([correctedRow()]))
      .toBe("corrected");
    expect(classifyReaderSummaryTelemetryMigrationHistory([
      correctedRow(), resolved,
    ])).toBe("recovered");
  });

  it.each([
    ["old checksum", { checksum: "0".repeat(64) }],
    ["nonzero old steps", { applied_steps_count: 1 }],
    ["missing reviewed log", { logs: null }],
    ["broad failure log", { logs: "permission denied for schema public" }],
    ["finished old row", { finished_at: rolledBack }],
    ["rollback before start", { rolled_back_at: "2026-08-24T11:59:59Z" }],
  ])("rejects %s drift on a rolled-back historical row", (_label, mutation) => {
    const row = { ...failedRow(), rolled_back_at: rolledBack, ...mutation };
    expect(classifyReaderSummaryTelemetryMigrationHistory([row])).toBe("invalid");
  });

  it.each([
    ["corrected checksum", { checksum: "f".repeat(64) }],
    ["zero corrected steps", { applied_steps_count: 0 }],
    ["non-null corrected logs", { logs: "" }],
    ["unfinished corrected row", { finished_at: null }],
    ["rolled-back corrected row", { rolled_back_at: correctedFinished }],
    ["corrected finish before start", {
      finished_at: "2026-08-24T12:01:59Z",
    }],
  ])("rejects %s drift on the corrected row", (_label, mutation) => {
    expect(classifyReaderSummaryTelemetryMigrationHistory([
      { ...correctedRow(), ...mutation },
    ])).toBe("invalid");
  });

  it("rejects ambiguous rows and invalid recovered ordering", () => {
    const resolved = { ...failedRow(), rolled_back_at: rolledBack };
    expect(classifyReaderSummaryTelemetryMigrationHistory([
      resolved, correctedRow(), { ...correctedRow(), id: "extra" },
    ])).toBe("invalid");
    expect(classifyReaderSummaryTelemetryMigrationHistory([
      { ...resolved, rolled_back_at: "2026-08-24T12:02:01Z" },
      correctedRow(),
    ])).toBe("invalid");
  });

  it("keeps the SQL classifier on the same exact row predicates", () => {
    const sql = readFileSync(
      "ops/deploy/reader-summary-telemetry-migration-state.sql", "utf8",
    );
    for (const predicate of [
      "applied_steps_count = 0 AND logs IS NOT NULL",
      "finished_at IS NULL AND rolled_back_at IS NULL",
      "started_at <= rolled_back_at",
      "applied_steps_count = 1 AND logs IS NULL",
      "started_at <= finished_at",
      "failure_rolled_back_at <= corrected_started_at",
      "row_count = 2 AND resolved_failure_count = 1 AND corrected_count = 1",
    ]) {
      expect(sql).toContain(predicate);
    }
    expect(sql).toContain(reviewedTelemetryFailureLog);
    expect(sql).toContain(readerSummaryTelemetryOldChecksum);
    expect(sql).toContain(readerSummaryTelemetryCorrectedChecksum);
  });

  it("executes the SQL and TypeScript classifiers identically under mutations",
    () => {
      const resolved = { ...failedRow(), rolled_back_at: rolledBack };
      const fixtures = [
        [], [failedRow()], [resolved], [correctedRow()],
        [resolved, correctedRow()],
        [{ ...resolved, logs: "permission denied for schema public" }],
        [{ ...correctedRow(), applied_steps_count: 0 }],
        [{ ...resolved, rolled_back_at: "2026-08-24T12:02:01Z" },
          correctedRow()],
        [resolved, correctedRow(), { ...correctedRow(), id: "extra" }],
      ] satisfies readonly (readonly ReaderSummaryTelemetryMigrationRow[])[];
      const executed = spawnSync(process.execPath, [
        "--input-type=module", "--eval", sqlClassifierRunner,
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        input: JSON.stringify(fixtures),
      });
      expect(executed.status).toBe(0);
      expect(executed.stderr).toBe("");
      expect(JSON.parse(executed.stdout) as unknown).toEqual(
        fixtures.map(classifyReaderSummaryTelemetryMigrationHistory),
      );
    }, 30_000);
});

const sqlClassifierRunner = String.raw`
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync(0, "utf8"));
const database = new PGlite();
await database.exec('CREATE TABLE public."_prisma_migrations" (id TEXT NOT NULL, checksum TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL, finished_at TIMESTAMPTZ, migration_name TEXT NOT NULL, logs TEXT, rolled_back_at TIMESTAMPTZ, applied_steps_count INTEGER NOT NULL)');
const states = [];
for (const rows of fixtures) {
  await database.exec('TRUNCATE public."_prisma_migrations"');
  for (const row of rows) await database.query("INSERT INTO public.\"_prisma_migrations\" (id, checksum, started_at, finished_at, migration_name, logs, rolled_back_at, applied_steps_count) VALUES ($1, $2, $3, $4, '20260824120000_reader_summary_daily_model_job_telemetry', $5, $6, $7)",
    [row.id, row.checksum, row.started_at, row.finished_at, row.logs,
      row.rolled_back_at, row.applied_steps_count]);
  const result = await database.query(readFileSync(
    "ops/deploy/reader-summary-telemetry-migration-state.sql", "utf8",
  ));
  states.push(result.rows[0].telemetry_history);
}
await database.close();
process.stdout.write(JSON.stringify(states));
`;
