import { resolve } from "node:path";

if (process.argv[1] !== undefined && resolve(process.argv[1]) === __filename) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const { loadDotenvIfPresent } = await import("./lib/env-file");
  loadDotenvIfPresent(".env");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const {
    configureProductionRecoverySession,
    resolveReaderSummaryProductionRecoveryScope,
  } = await import("./recover-reader-summary-production");
  const scope = resolveReaderSummaryProductionRecoveryScope(process.env);
  const {
    resolvePostgresRuntimePoolConfig,
    runWithTenantDatabaseAccess,
  } = await import("@social-monitor/platform-persistence");
  const { PrismaSummaryConnection } = await import(
    "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection"
  );
  const { prepareReaderSummaryProductionRecoveryGapAuthority } = await import(
    "./lib/reader-summary-production-recovery-gap-authority"
  );
  const connection = await PrismaSummaryConnection.create(
    resolvePostgresRuntimePoolConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
    }),
  );
  try {
    const result = await runWithTenantDatabaseAccess(scope, async () => {
      await configureProductionRecoverySession(connection, scope);
      return prepareReaderSummaryProductionRecoveryGapAuthority(
        connection,
        scope,
      );
    });
    console.log(
      `reader-summary-production-recovery-gap-authority outcome=${result.outcome}`,
    );
  } finally {
    await connection.close();
  }
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};
