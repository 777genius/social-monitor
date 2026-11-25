import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { runWithTenantDatabaseAccess, resolvePostgresRuntimePoolConfig, withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { requiredHistoricalPromotionSystemDatabaseUrl, assertHistoricalPromotionSystemRole } from "./lib/reader-summary-promotion-v2-system-database";
import { refreshDates, refreshScope } from "./lib/reader-summary-new-input-refresh-manifest";
import { assertRefreshFences, readRefreshFenceAuthority } from "./lib/reader-summary-new-input-refresh-files";
import { readRefreshJobs, readRefreshPrior, readRefreshReconciliations } from "./lib/reader-summary-new-input-refresh-postgres";
import { refreshLiveJobs } from "./lib/reader-summary-new-input-refresh-guard";
import { readReviewedRefreshReconciliation, reconcileConsumedRefreshJob } from "./lib/reader-summary-new-input-refresh-reconciliation";
import { readReviewedRefreshReconciliationCounters, importRefreshReconciliationCounters } from "./lib/reader-summary-new-input-refresh-reconciliation-counters";

const sha256 = /^[0-9a-f]{64}$/u;
export function parseReconciliationCommand(argv: readonly string[]) {
  if (argv.length === 3 && argv[0] === "--inspect" && argv[1] === "--date" &&
      refreshDates.includes(argv[2]!)) {
    return { mode: "inspect", date: argv[2]! } as const;
  }
  for (const [flag, mode] of [["--reconcile", "reconcile"], ["--import-counters", "counters"]] as const) {
    if (argv.length === 4 && argv[0] === flag && argv[2] === "--sha256" && sha256.test(argv[3]!)) {
      return { mode, path: argv[1]!, sha256: argv[3]! } as const;
    }
  }
  throw new Error("Use --inspect --date ACCEPTED_DATE, --reconcile EVIDENCE --sha256 HASH, or --import-counters EVIDENCE --sha256 HASH");
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const command = parseReconciliationCommand(process.argv.slice(2));
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const fencePaths = {
    globalLock: required("READER_SUMMARY_REFRESH_GLOBAL_LOCK"),
    dateDirectory: required("READER_SUMMARY_REFRESH_DATE_LOCK_DIR"),
    fenceDirectory: required("READER_SUMMARY_REFRESH_FENCE_DIR"),
  };
  const config = resolvePostgresRuntimePoolConfig({ ...process.env,
    DATABASE_URL: requiredHistoricalPromotionSystemDatabaseUrl(process.env),
    POSTGRES_RUNTIME_PROCESS: "daily-runner", POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" });
  const summary = await PrismaSummaryConnection.create(config);
  try {
    await runWithTenantDatabaseAccess(refreshScope, async () => {
      await assertHistoricalPromotionSystemRole(summary);
      if (command.mode === "inspect") {
        const jobs = await readRefreshJobs(summary, command.date);
        const reconciled = await readRefreshReconciliations(summary, command.date);
        console.log(JSON.stringify({ date: command.date, jobs, reconciled,
          live: refreshLiveJobs(jobs, reconciled, ""),
          prior: await readRefreshPrior(summary, command.date) }));
        return;
      }
      // Both writes gate a later paid attempt, so they run under exactly the
      // canonical held global/date flocks the refresh itself requires.
      const date = command.mode === "reconcile"
        ? readReviewedRefreshReconciliation(command.path, command.sha256, refreshDates).evidence.date
        : readReviewedRefreshReconciliationCounters(command.path, command.sha256, refreshDates).evidence.date;
      assertRefreshFences(date, fencePaths, process.env.READER_SUMMARY_DATE_FENCE_TOKEN,
        readRefreshFenceAuthority(fencePaths));
      const receipt = await withPrismaWriteRetry(() => summary.$transaction(async (tx) => {
        assertRefreshFences(date, fencePaths, process.env.READER_SUMMARY_DATE_FENCE_TOKEN,
          readRefreshFenceAuthority(fencePaths));
        if (command.mode === "reconcile") {
          const { evidence, evidenceSha256 } = readReviewedRefreshReconciliation(
            command.path, command.sha256, refreshDates);
          return await reconcileConsumedRefreshJob({ client: tx, evidence, evidenceSha256,
            now: clock.now(), ids });
        }
        const { evidence, evidenceSha256 } = readReviewedRefreshReconciliationCounters(
          command.path, command.sha256, refreshDates);
        return await importRefreshReconciliationCounters({ client: tx, evidence, evidenceSha256,
          now: clock.now(), ids });
      }, { isolationLevel: "Serializable", maxWait: 30_000, timeout: 120_000 }));
      console.log(JSON.stringify({ ...receipt, date, evidenceSha256: command.sha256 }));
    });
  } finally { await summary.close(); }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Reconciliation must never look successful. Only this module's own
    // messages are echoed; SQL and provider errors can carry payloads or
    // credentials, so they are reported as an opaque class.
    const message = error instanceof Error && error.message.startsWith("Refresh")
      ? error.message
      : "database or environment error";
    console.error(`Reader summary refresh reconciliation stopped: ${message}. Do not reset the original job budget.`);
    process.exitCode = 1;
  });
}
