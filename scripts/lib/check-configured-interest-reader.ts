import { PrismaMonitoringConnection } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-monitoring-connection";
import { PrismaInterestRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-interest.repository";
import { MonitoringConfiguredInterestReader } from "@social-monitor/relevance/adapters/monitoring/monitoring-configured-interest.reader";
import type { ConfiguredInterestReaderPort } from "@social-monitor/relevance/ports";
import { defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";

// A separate Monitoring lease per scoped read. No Feed/provider metadata authority,
// no retained connection, and no pool acquisition until fresh ranking needs it.
export function checkConfiguredInterestReader(databaseUrl: string): ConfiguredInterestReaderPort {
  const config = defaultPostgresRuntimePoolConfig(databaseUrl, "admin-tool");
  return {
    async readCurrent(scope) {
      let connection: PrismaMonitoringConnection | undefined;
      try {
        connection = await PrismaMonitoringConnection.create(config);
        const reader = new MonitoringConfiguredInterestReader(new PrismaInterestRepository(connection));
        return await runWithTenantDatabaseAccess(scope, () => reader.readCurrent(scope));
      } catch {
        return { kind: "unavailable" };
      } finally {
        await connection?.close();
      }
    },
  };
}

// These legacy replay checks do not capture sufficient immutable input authority.
// Explicit fresh selection is a new evaluation of an old window, never recovery.
export function requireFreshCheckSelection(argv: readonly string[]): void {
  if (!argv.includes("--fresh-selection")) {
    throw new Error("Immutable replay requires captured configured-interest evidence; legacy replay is unsupported. Use --fresh-selection only for a new evaluation with current Monitoring configuration.");
  }
}
