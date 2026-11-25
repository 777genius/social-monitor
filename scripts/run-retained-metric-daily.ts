import { SystemClock } from "@social-monitor/shared-kernel";
import { retainedMetricRenewalEffects } from "./lib/retained-metric-renewal-composition";
import { acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess,
  type PrismaPgRuntimeClientConstructor } from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import type { PrismaSourceEngagementClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import { PrismaRetainedMetricInventory, type PrismaMetricInventoryClient } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import { RenewDailyRetainedMetricsUseCase, type MetricRenewalFinal } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-daily-retained-metrics.use-case";
import type { MetricDailyManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-daily.contracts";
import { metricRenewalCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-report";
import { resolveMetricDaily } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-daily-evidence";
import { retainedMetricDailyGrant } from "@social-monitor/ingestion/domain/policies/retained-metric-daily-grant";
import type { MetricRefreshOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import { metricRefreshDigest as hash } from "./lib/retained-metric-refresh-receipts";
import { retainedMetricDailyReceipts } from "./lib/retained-metric-daily-receipts";
import { metricExecutableIdentity, metricMaintenanceAdmission } from "./lib/retained-metric-maintenance";

type RuntimeClient = PrismaMetricInventoryClient & PrismaSourceEngagementClient & { $disconnect(): Promise<void> };
const scoped = (operation: MetricRefreshOperation) => ({ ...operation,
  withOperation: async <T>(work: (held: MetricRefreshOperation) => Promise<T>) => { operation.assertHeld(); return work(operation); } });
function renewalReport(final: MetricRenewalFinal, manifest: MetricDailyManifest) {
  const originals = new Set(manifest.capture.originalAudit.map((a) => a.sourceItemId));
  return { ...final, cohorts: {
    oldMissing: manifest.capture.originalAudit.filter((a) => a.currentTarget === null),
    originals: { count: originals.size, cells: metricRenewalCells(final.results.filter((r) => originals.has(r.sourceItemId)), manifest.scope.dates) },
    lateArrivals: { count: manifest.capture.lateArrivalSourceItemIds.length,
      cells: metricRenewalCells(final.results.filter((r) => !originals.has(r.sourceItemId)), manifest.scope.dates) },
  } };
}
export async function runRetainedMetricDaily(args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  if (args.length === 1 && args[0] === "--implementation") {
    process.stdout.write(`${JSON.stringify(metricExecutableIdentity())}\n`); return;
  }
  const options = new Map<string, string>();
  const modes = ["--prepare", "--apply", "--resume", "--diagnostic"];
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (![...modes, "--date", "--manifest-sha", "--source-sha", "--executable-sha", "--legacy-retirement-ref"].includes(key) || options.has(key)) throw new Error("Invalid renewal flag");
    const value = modes.includes(key) ? "true" : args[++i];
    if (!value || value.startsWith("--")) throw new Error("Missing renewal value");
    options.set(key, value);
  }
  const apply = options.has("--apply") || options.has("--resume");
  if (modes.filter((m) => options.has(m)).length !== 1 || options.has("--manifest-sha") !== apply ||
      (apply && !/^[a-f0-9]{64}$/u.test(options.get("--manifest-sha")!))) throw new Error("Invalid renewal mode/SHA");
  const grant = retainedMetricDailyGrant(options.get("--date") ?? "");
  if (!grant) throw new Error("Daily date not reviewed");
  const maintenance = metricMaintenanceAdmission(options.get("--source-sha"), options.get("--executable-sha"), options.get("--legacy-retirement-ref"));
  const clock = new SystemClock(), authorities = retainedMetricDailyReceipts(grant.date, maintenance.assertHeld);
  await authorities.predecessor.withOperation((prior) => authorities.spent.withOperation((spent) => authorities.renewal.withOperation(async (operation) => {
    const existing = await resolveMetricDaily(grant.date, operation, prior, spent, hash, clock.now());
    if (apply && (!existing || hash(existing) !== options.get("--manifest-sha"))) throw new Error("Reviewed renewal SHA mismatch");
    if (existing && (existing.capture.implementation.sourceSha !== maintenance.implementation.sourceSha ||
        existing.capture.implementation.executableSha !== maintenance.implementation.executableSha)) throw new Error("Renewal release changed");
    const final = existing ? await operation.read<MetricRenewalFinal>(`${grant.evidencePath}/final.json`) : null;
    // Terminal replay and repeated preparation do not acquire a DB or OAuth.
    if ((apply && final !== null) || (options.has("--prepare") && existing)) {
      if (apply && final?.results.some((row) => ["failed", "uncertain"].includes(row.status))) process.exitCode = 1;
      process.stdout.write(`${JSON.stringify(apply ? renewalReport(final!, existing!) : { manifest: existing, manifestSha: hash(existing) })}\n`); return;
    }
    const config = defaultPostgresRuntimePoolConfig(env.METRIC_REFRESH_DATABASE_URL ?? "", "admin-tool");
    const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RuntimeClient>>();
    const connection = await acquirePrismaPgRuntimeConnection(config, PrismaClient);
    try {
      await runWithTenantDatabaseAccess({ tenantId: grant.tenantId, workspaceId: grant.workspaceId }, async () => {
        const inventory = new PrismaRetainedMetricInventory(connection.client, hash);
        if (options.has("--diagnostic")) {
          if (!existing) throw new Error("Prepare renewal first");
          const captureStartedAt = clock.now().toISOString();
          const currentWindow = await inventory.list(existing.scope);
          const originals = await inventory.list(existing.scope, existing.capture.originalAudit.map((a) => a.sourceItemId));
          process.stdout.write(`${JSON.stringify({ diagnostic: true, manifestSha: hash(existing), captureStartedAt, captureCompletedAt: clock.now().toISOString(), currentWindow, originals,
            outsideGrantSourceItemIds: currentWindow.filter((t) => !existing.targets.some((f) => f.sourceItemId === t.sourceItemId)).map((t) => t.sourceItemId) })}\n`); return;
        }
        const { projection, fetcher } = retainedMetricRenewalEffects(connection.client, existing, clock, env);
        const usecase = new RenewDailyRetainedMetricsUseCase(grant.date, inventory, fetcher, projection, scoped(prior), scoped(spent), scoped(operation), clock, hash);
        const result = apply ? await usecase.execute(options.get("--manifest-sha")!) : await usecase.prepare(maintenance.implementation);
        const output = apply && result.ok && "results" in result.value && existing ? renewalReport(result.value, existing) :
          { result, ...(!apply && result.ok ? { manifestSha: hash(result.value) } : {}) };
        process.stdout.write(`${JSON.stringify(output)}\n`);
        if (!result.ok) process.exitCode = 1;
        else if (apply) {
          const outcomes = "results" in result.value ? result.value.results : Array.isArray(result.value) ? result.value : [];
          if (Array.isArray(result.value) || outcomes.some((row) => ["failed", "uncertain"].includes(row.status))) process.exitCode = 1;
        }
      });
    } finally { await connection.close(); }
  })));
}
if (require.main === module) void runRetainedMetricDaily(process.argv.slice(2), process.env).catch(() => {
  process.stderr.write("Metric renewal failed closed; preserve both canonical journals and reconcile.\n"); process.exitCode = 1;
});
