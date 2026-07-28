import { Pool } from "pg";

import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  loadReaderSummaryWeeklyProductionDbState,
  resolveReaderSummaryWeeklyProductionWindow,
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
    await assertReaderSummaryWeeklyProductionPostgresContract(pool);
    const state = await loadReaderSummaryWeeklyProductionDbState(
      pool,
      readScope(),
      resolveReaderSummaryWeeklyProductionWindow("2026-07-20"),
    );
    if (
      state.status !== "complete" ||
      state.certifications.length !== 7 ||
      state.missingDates.length !== 0 ||
      state.blockingReasons.length !== 0
    ) {
      throw new Error(
        `weekly daily certification check failed: ${state.blockingReasons.join("; ")}`,
      );
    }
    console.log(
      "weekly_daily_certifications=ok week=2026-07-20..2026-07-26 certifications=7",
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
