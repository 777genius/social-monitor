import { Pool } from "pg";

import {
  backfillReaderSummaryWeeklyDailyCertifications,
  resolveReaderSummaryWeeklyDailyCertificationBackfillWindow,
} from "./lib/reader-summary-weekly-daily-certification-backfill";
import { parseReaderSummaryWeeklyDailyCertificationBackfillArgs } from "./lib/reader-summary-weekly-daily-certification-backfill-cli";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionScope,
} from "./lib/reader-summary-weekly-production-postgres-contract";

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const options = parseReaderSummaryWeeklyDailyCertificationBackfillArgs(
    process.argv.slice(2),
  );
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const scope = readScope();
    const window =
      resolveReaderSummaryWeeklyDailyCertificationBackfillWindow(
        options.weekStartedOn,
        new Date(),
      );
    const rows = await withReaderSummaryWeeklyProductionDatabaseAccess(
      pool,
      {
        kind: "tenant",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
      async (client) => {
        await assertReaderSummaryWeeklyProductionPostgresContract(client);
        return backfillReaderSummaryWeeklyDailyCertifications(
          client,
          scope,
          window,
        );
      },
    );
    console.log(
      [
        "weekly_daily_certification_backfill=ok",
        `week=${window.weekStartedOn}..${window.weekEndedOn}`,
        `inserted=${rows.filter((row) => row.outcome === "inserted").length}`,
        `replayed=${rows.filter((row) => row.outcome === "replayed").length}`,
      ].join(" "),
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function readScope(): ReaderSummaryWeeklyProductionScope {
  const interestId =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_INTEREST_ID?.trim();
  return Object.freeze({
    tenantId: requireEnv("READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID"),
    workspaceId: requireEnv("READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID"),
    scope:
      interestId === undefined || interestId.length === 0
        ? Object.freeze({ type: "workspace" as const })
        : Object.freeze({ type: "interest" as const, interestId }),
  });
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
