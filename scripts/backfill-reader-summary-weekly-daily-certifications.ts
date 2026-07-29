import { Pool } from "pg";

import { backfillReaderSummaryWeeklyDailyCertifications } from "./lib/reader-summary-weekly-daily-certification-backfill";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  resolveReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionScope,
} from "./lib/reader-summary-weekly-production-postgres-contract";

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const scope = readScope();
    const window = resolveReaderSummaryWeeklyProductionWindow("2026-07-20");
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
        "week=2026-07-20..2026-07-26",
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
