import { cpSync } from "node:fs";
import { join } from "node:path";

import { applyOrderedReaderSummaryMigrations } from
  "./reader-summary-publication-postgres-migrations";
import type { createReaderSummaryPublicationMigrationWorkspace } from
  "./reader-summary-publication-postgres-migrations";
import { assertReaderSummaryDailyTelemetryReleaseDatabaseState } from
  "./reader-summary-daily-telemetry-release";

type ReleaseDatabaseClient = Parameters<
  typeof assertReaderSummaryDailyTelemetryReleaseDatabaseState
>[0];

export const applyReaderSummaryProductionRecoveryRelease = async (params: {
  readonly adminDatabaseUrl: string;
  readonly client: ReleaseDatabaseClient;
  readonly defaultAclMigration: string;
  readonly migrationAdminRole: string;
  readonly migrations: readonly string[];
  readonly migrationWorkspace: ReturnType<
    typeof createReaderSummaryPublicationMigrationWorkspace
  >;
  readonly runBootstrap: (
    phase: "pre" | "post",
    adminDatabaseUrl: string,
    runtimeRole: string,
  ) => Promise<void>;
  readonly runtimeRole: string;
  readonly telemetryMigration: string;
}): Promise<void> => {
  await params.runBootstrap(
    "pre",
    params.adminDatabaseUrl,
    params.runtimeRole,
  );
  for (const migration of params.migrations) {
    cpSync(
      join(process.cwd(), "prisma", "migrations", migration),
      join(params.migrationWorkspace.directory, "migrations", migration),
      { recursive: true },
    );
  }
  applyOrderedReaderSummaryMigrations(
    params.adminDatabaseUrl,
    params.migrationWorkspace,
  );
  await params.runBootstrap(
    "post",
    params.adminDatabaseUrl,
    params.runtimeRole,
  );
  await assertReaderSummaryDailyTelemetryReleaseDatabaseState(params.client, {
    defaultAclMigration: params.defaultAclMigration,
    migrationAdminRole: params.migrationAdminRole,
    telemetryMigration: params.telemetryMigration,
  });
};
