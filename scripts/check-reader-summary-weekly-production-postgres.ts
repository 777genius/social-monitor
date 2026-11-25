import { Pool } from "pg";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  loadReaderSummaryWeeklyProductionDbState,
  previousCompletedReaderSummaryWeeklyProductionWindow,
  resolveCompletedReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionScope,
} from "./lib/reader-summary-weekly-production-postgres-contract";

loadDotenvIfPresent(".env");

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
    const scope = readOptionalScope();
    if (scope === null) {
      await withReaderSummaryWeeklyProductionDatabaseAccess(
        pool,
        { kind: "system" },
        assertReaderSummaryWeeklyProductionPostgresContract,
      );
      console.log("weekly_postgres_contract=ok status=unscoped");
      return;
    }
    const weekStartedOn = readOption("--week-start");
    const now = new Date();
    const window =
      weekStartedOn === null
        ? previousCompletedReaderSummaryWeeklyProductionWindow(now)
        : resolveCompletedReaderSummaryWeeklyProductionWindow(
            weekStartedOn,
            now,
          );
    const state = await withReaderSummaryWeeklyProductionDatabaseAccess(
      pool,
      {
        kind: "tenant",
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
      async (client) => {
        await assertReaderSummaryWeeklyProductionPostgresContract(client);
        return loadReaderSummaryWeeklyProductionDbState(client, scope, window);
      },
    );
    console.log(
      [
        "weekly_postgres_contract=ok",
        `status=${state.status}`,
        `week=${state.window.weekStartedOn}..${state.window.weekEndedOn}`,
        `certifications=${state.certifications.length}`,
        `missing=${state.missingDates.length}`,
      ].join(" "),
    );
    for (const reason of state.blockingReasons) {
      console.log(`blocking_reason=${reason}`);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function readOptionalScope(): ReaderSummaryWeeklyProductionScope | null {
  const tenantId = process.env.READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID?.trim();
  const workspaceId =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID?.trim();
  if (
    tenantId === undefined ||
    tenantId.length === 0 ||
    workspaceId === undefined ||
    workspaceId.length === 0
  ) {
    return null;
  }
  const interestId =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_INTEREST_ID?.trim();
  return Object.freeze({
    tenantId,
    workspaceId,
    scope:
      interestId === undefined || interestId.length === 0
        ? Object.freeze({ type: "workspace" as const })
        : Object.freeze({ type: "interest" as const, interestId }),
  });
}

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
