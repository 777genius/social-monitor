import { runGitHubTrendingDurableSnapshotPostgresScenarios } from "./lib/github-trending-durable-snapshot-reuse.postgres.spec";
import { withDisposableGitHubTrendingPostgres } from "./lib/github-trending-durable-snapshot-reuse-postgres-fixture";

const serverAdminDatabaseUrl = requiredEnv(
  "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL",
);

async function main(): Promise<void> {
  await withDisposableGitHubTrendingPostgres(
    serverAdminDatabaseUrl,
    runGitHubTrendingDurableSnapshotPostgresScenarios,
  );
  console.log(
    "GitHub Trending durable snapshot disposable PostgreSQL gate OK",
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      `${name} is required; the disposable PostgreSQL durable-reuse gate never skips`,
    );
  }
  return value;
}

void main();
