/** Child process used only by the disposable PostgreSQL recovery contract. */
import { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { executeRecoveryAcquisition } from "./hn-rss-recovery-acquisition";
import { parseRecoveryArgs } from "./hn-rss-recovery-plan";
import { syntheticRecoveryProvider } from "./hn-rss-recovery-synthetic-provider";
import { readBindingFromDatabase, runRecovery } from "../run-hn-rss-recovery";

async function main(): Promise<void> {
  const mode = process.argv[2];
  const databaseUrl = process.env.HN_RSS_RECOVERY_SYNTHETIC_RUNTIME_URL;
  if ((mode !== "run" && mode !== "crash") || databaseUrl === undefined) throw new Error("Synthetic worker setup missing");
  const request = parseRecoveryArgs(process.argv.slice(3), new Date());
  const result = await runRecovery(request, {
    readBinding: (value) => readBindingFromDatabase(value, databaseUrl),
    acquire: async (value, binding, identity) => {
      process.stdout.write("SYNTHETIC_ACQUIRE\n");
      const connection = await PrismaIngestionWorkerConnection.createForProcess(databaseUrl, "daily-runner");
      try {
        return await executeRecoveryAcquisition({ connection, tenantId: value.tenantId, workspaceId: value.workspaceId,
          sourceBindingId: value.sourceBindingId, providerKey: value.providerKey, from: value.from, to: value.to,
          binding, ...identity, provider: syntheticRecoveryProvider(value.providerKey, value.sourceBindingId) });
      } finally {
        await connection.close();
        if (mode === "crash") process.exit(77);
      }
    },
  });
  process.stdout.write(`${JSON.stringify({ status: result.status })}\n`);
}

void main().catch((error: unknown) => {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  const reservationRefused = code === "EEXIST" ||
    (error instanceof Error && error.message.includes("uncertain STARTED"));
  process.stderr.write(reservationRefused ? "SYNTHETIC_RESERVATION_REFUSED\n" : "SYNTHETIC_RECOVERY_FAILED\n");
  process.exitCode = 2;
});
