import { acquirePrismaPgRuntimeConnection, defaultPostgresRuntimePoolConfig, runWithTenantDatabaseAccess,
  type PrismaPgRuntimeClientConstructor } from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import { CryptoIdGenerator, SystemClock } from "@social-monitor/shared-kernel";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import type { PrismaSourceEngagementClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import { PrismaRetainedMetricInventory, type PrismaMetricInventoryClient } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { HttpRedditClient } from "@social-monitor/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditAppOnlyTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { RetainedMetricFetchAdapter } from "@social-monitor/ingestion/adapters/source/retained-metric-fetch.capability";
import { RenewRetainedMetricsUseCase, type MetricRenewalFinal } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import type { MetricRenewalManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal.contracts";
import { metricRefreshCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-report";
import { resolveMetricRenewal } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-evidence";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import { sameTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricRefreshOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import { metricRefreshDigest as hash } from "./lib/retained-metric-refresh-receipts";
import { retainedMetricRenewalReceipts } from "./lib/retained-metric-renewal-receipts";
import { metricExecutableIdentity, metricMaintenanceAdmission } from "./lib/retained-metric-maintenance";

type RuntimeClient = PrismaMetricInventoryClient & PrismaSourceEngagementClient & { $disconnect(): Promise<void> };
const scoped = (operation: MetricRefreshOperation) => ({ ...operation,
  withOperation: async <T>(work: (held: MetricRefreshOperation) => Promise<T>) => { operation.assertHeld(); return work(operation); } });
function renewalReport(final: MetricRenewalFinal, manifest: MetricRenewalManifest) {
  const originals = new Set(manifest.predecessor.originalSourceItemIds);
  return { ...final, cohorts: {
    originals: { count: originals.size, cells: metricRefreshCells(final.results.filter((r) => originals.has(r.sourceItemId)), manifest.scope.dates) },
    lateArrivals: { count: manifest.capture.lateArrivalSourceItemIds.length,
      cells: metricRefreshCells(final.results.filter((r) => !originals.has(r.sourceItemId)), manifest.scope.dates) },
  } };
}
export async function runRetainedMetricRenewal(args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  if (args.length === 1 && args[0] === "--implementation") {
    process.stdout.write(`${JSON.stringify(metricExecutableIdentity())}\n`); return;
  }
  const options = new Map<string, string>();
  const modes = ["--prepare", "--apply", "--resume", "--diagnostic"];
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (![...modes, "--manifest-sha", "--source-sha", "--executable-sha", "--legacy-retirement-ref"].includes(key) || options.has(key)) throw new Error("Invalid renewal flag");
    const value = modes.includes(key) ? "true" : args[++i];
    if (!value || value.startsWith("--")) throw new Error("Missing renewal value");
    options.set(key, value);
  }
  const apply = options.has("--apply") || options.has("--resume");
  if (modes.filter((m) => options.has(m)).length !== 1 || options.has("--manifest-sha") !== apply ||
      (apply && !/^[a-f0-9]{64}$/u.test(options.get("--manifest-sha")!))) throw new Error("Invalid renewal mode/SHA");
  const maintenance = metricMaintenanceAdmission(options.get("--source-sha"), options.get("--executable-sha"), options.get("--legacy-retirement-ref"));
  const clock = new SystemClock(), authorities = retainedMetricRenewalReceipts(maintenance.assertHeld);
  await authorities.predecessor.withOperation((prior) => authorities.renewal.withOperation(async (operation) => {
    const existing = await resolveMetricRenewal(operation, prior, hash, clock.now());
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
          const currentWindow = await inventory.list(existing.scope);
          const originals = await inventory.list(existing.scope, existing.predecessor.originalSourceItemIds);
          process.stdout.write(`${JSON.stringify({ diagnostic: true, currentWindow, originals,
            outsideGrantSourceItemIds: currentWindow.filter((t) => !existing.targets.some((f) => f.sourceItemId === t.sourceItemId)).map((t) => t.sourceItemId) })}\n`); return;
        }
        const projection = new PrismaSourceEngagementProjectionAdapter(connection.client, new CryptoIdGenerator(), {
          retention: "skip", sampleGuard: async (transaction, _command, sample) => {
            const expected = existing?.targets.find((t) => t.sourceItemId === sample.sourceItemId);
            const guarded = new PrismaRetainedMetricInventory(transaction as unknown as PrismaMetricInventoryClient, hash);
            if (!expected || !sameTarget(expected, await guarded.read(existing!.scope, expected.sourceItemId), hash)) throw new Error("Transactional renewal target drift");
          },
        });
        let tokenProvider: RedditAppOnlyTokenProvider | undefined;
        const token = { getAccessToken: async () => {
          tokenProvider ??= new RedditAppOnlyTokenProvider({ clientId: env.REDDIT_APP_CLIENT_ID ?? "", clientSecret: env.REDDIT_APP_CLIENT_SECRET ?? "",
            userAgent: env.REDDIT_APP_USER_AGENT, timeoutMs: 10_000, now: () => clock.now().getTime() });
          return tokenProvider.getAccessToken();
        } };
        const fetcher = new RetainedMetricFetchAdapter(new HttpHackerNewsClient(10_000), new HttpRedditClient("https://oauth.reddit.com", 10_000), token,
          env.REDDIT_APP_USER_AGENT ?? "social-monitor-retained-metrics/1");
        const usecase = new RenewRetainedMetricsUseCase(inventory, fetcher, projection, scoped(prior), scoped(operation), clock, hash);
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
  }));
}
if (require.main === module) void runRetainedMetricRenewal(process.argv.slice(2), process.env).catch(() => {
  process.stderr.write("Metric renewal failed closed; preserve both canonical journals and reconcile.\n"); process.exitCode = 1;
});
