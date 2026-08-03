import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const readerSummaryPublicationMigration =
  "20260716170000_reader_summary_fail_closed_publication";

export type ReaderSummaryPublicationMigrationWorkspace = Readonly<{
  directory: string;
  schemaPath: string;
}>;

export const createReaderSummaryPublicationMigrationWorkspace =
  (): ReaderSummaryPublicationMigrationWorkspace => {
    const directory = mkdtempSync(
      join(tmpdir(), "reader-summary-publication-migrations-"),
    );
    return { directory, schemaPath: join(directory, "schema.prisma") };
  };

export const preparePrePublicationMigrations = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  cpSync("prisma/schema.prisma", workspace.schemaPath);
  const targetMigrations = join(workspace.directory, "migrations");
  mkdirSync(targetMigrations);
  for (const migration of readerSummaryMigrationNames()) {
    if (migration >= readerSummaryPublicationMigration) {
      continue;
    }
    copyMigration(workspace, migration);
  }
};

export const installPublicationAndFollowingMigrations = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  for (const migration of readerSummaryMigrationNames()) {
    if (migration < readerSummaryPublicationMigration) {
      continue;
    }
    copyMigration(workspace, migration);
  }
};

export const removeReaderSummaryPublicationMigrationWorkspace = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  rmSync(workspace.directory, { recursive: true, force: true });
};

export const readerSummaryMigrationNames = (): readonly string[] =>
  readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

export const applyOrderedReaderSummaryMigrations = (
  url: string,
  workspace: ReaderSummaryPublicationMigrationWorkspace,
): void => {
  const result = spawnPrisma(
    [
      "migrate",
      "deploy",
      "--config",
      "scripts/reader-summary-publication-prisma.config.ts",
    ],
    {
      DATABASE_URL: url,
      READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: workspace.schemaPath,
      READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: join(
        dirname(workspace.schemaPath),
        "migrations",
      ),
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error("ordered baseline migration upgrade failed");
  }
};

export const assertReaderSummaryMigrationDatabaseMatchesSchema = (
  url: string,
): void => {
  const result = spawnPrisma(
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    { DATABASE_URL: url },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    throw new Error(
      "ordered baseline and forward migrations must exactly match the Prisma schema",
    );
  }
};

const copyMigration = (
  workspace: ReaderSummaryPublicationMigrationWorkspace,
  migration: string,
): void => {
  cpSync(
    join("prisma/migrations", migration),
    join(workspace.directory, "migrations", migration),
    { recursive: true },
  );
};

const spawnPrisma = (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
) =>
  spawnSync(process.platform === "win32" ? "prisma.cmd" : "prisma", args, {
    encoding: "utf8",
    env: { ...process.env, JITI_FS_CACHE: "false", ...env },
  });
