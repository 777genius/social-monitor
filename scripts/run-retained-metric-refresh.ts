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
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";
import { manifestProblem, metricRefreshBounds, metricRefreshSourceBase, metricRefreshDates, metricRefreshEvidencePath, metricRefreshTenant, metricRefreshWorkspace, sameTarget, scopeProblem, targetIdentity } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricRefreshManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { metricRefreshDigest, SecureMetricRefreshReceipts } from "./lib/retained-metric-refresh-receipts";

import { AmendRetainedMetricManifestUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case";
import { resolveMetricOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-amendment";
import { metricExecutableIdentity, metricMaintenanceAdmission } from "./lib/retained-metric-maintenance";

import { metricRefreshCells as summarizeMetricRefresh } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-report";
export { summarizeMetricRefresh };

type RuntimeClient = PrismaMetricInventoryClient & PrismaSourceEngagementClient & { $disconnect(): Promise<void> };
export async function runRetainedMetricRefresh(args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  if (args.length === 1 && args[0] === "--implementation") {
    process.stdout.write(`${JSON.stringify(metricExecutableIdentity())}\n`); return;
  }
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!["--apply", "--operation-id", "--dates", "--manifest-sha", "--prepare-amendment", "--commit-amendment", "--prior-manifest-sha", "--effective-manifest-sha", "--reason", "--source-sha", "--executable-sha", "--legacy-retirement-ref"].includes(key) || options.has(key)) throw new Error("Invalid or duplicate CLI flag");
    const value = ["--apply", "--prepare-amendment"].includes(key) ? "true" : args[++i];
    if (!value || value.startsWith("--")) throw new Error("Missing CLI value");
    options.set(key, value);
  }
  const operationId = options.get("--operation-id");
  if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(operationId)) throw new Error("An explicit operation UUID is required");
  if (options.has("--apply") !== options.has("--manifest-sha")) throw new Error("Apply requires the reviewed manifest SHA");
  const prepare = options.has("--prepare-amendment"), commit = options.has("--commit-amendment");
  if (Number(prepare) + Number(commit) + Number(options.has("--apply")) > 1 ||
      options.has("--prior-manifest-sha") !== (prepare || commit) || options.has("--reason") !== prepare ||
      options.has("--effective-manifest-sha") !== commit) throw new Error("Invalid amendment mode or review fields");
  for (const key of ["--manifest-sha", "--commit-amendment", "--prior-manifest-sha", "--effective-manifest-sha", "--source-sha", "--executable-sha"]) {
    if (options.has(key) && !/^[a-f0-9]{64}$/u.test(options.get(key)!)) throw new Error("Invalid reviewed SHA");
  }
  const maintenance = metricMaintenanceAdmission(options.get("--source-sha"), options.get("--executable-sha"), options.get("--legacy-retirement-ref"));
  const clock = new SystemClock();
  const now = clock.now();
  const dates = options.get("--dates")?.split(",") ?? metricRefreshDates;
  const scope = { tenantId: metricRefreshTenant, workspaceId: metricRefreshWorkspace, dates,
    endAt: new Date(Math.min(now.getTime(), Date.parse(`${dates.at(-1)}T00:00:00Z`) + 86_400_000)).toISOString() };
  const invalid = scopeProblem(scope, now);
  if (invalid) throw new Error(invalid);
  const authority = new SecureMetricRefreshReceipts(maintenance.assertHeld);
  await authority.withOperation(async (receipts) => {
  const path = `${metricRefreshEvidencePath}/operation.json`;
  const head = await resolveMetricOperation(receipts, metricRefreshDigest, now);
  const existing = head?.effective;
  if (existing && (existing.operationId !== operationId || existing.scope.dates.join() !== dates.join())) throw new Error("Canonical operation identity cannot change");
  if ((prepare || commit || options.has("--apply")) && !existing) throw new Error("Prepare the immutable operation first");
  // Wrong/stale apply SHA rejects before even acquiring a database connection.
  if (options.has("--apply") && options.get("--manifest-sha") !== metricRefreshDigest(existing)) throw new Error("Reviewed manifest SHA mismatch");
  const config = defaultPostgresRuntimePoolConfig(env.METRIC_REFRESH_DATABASE_URL ?? "", "admin-tool");
  const PrismaClient = loadPrismaRuntimeClient<PrismaPgRuntimeClientConstructor<RuntimeClient>>();
  const connection = await acquirePrismaPgRuntimeConnection(config, PrismaClient);
  try {
    await runWithTenantDatabaseAccess(scope, async () => {
      const inventory = new PrismaRetainedMetricInventory(connection.client, metricRefreshDigest);
      const scopedAuthority = { ...receipts, withOperation: async <T>(work: (operation: typeof receipts) => Promise<T>) => { receipts.assertHeld(); return work(receipts); } };
      if (prepare || commit) {
        const amend = new AmendRetainedMetricManifestUseCase(inventory, scopedAuthority, clock, metricRefreshDigest, maintenance.implementation);
        const result = prepare ? await amend.prepare(options.get("--prior-manifest-sha")!, options.get("--reason")!) :
          await amend.commit(options.get("--commit-amendment")!, options.get("--prior-manifest-sha")!, options.get("--effective-manifest-sha")!);
        process.stdout.write(`${JSON.stringify({ mode: prepare ? "prepare-amendment" : "commit-amendment", result,
          ...(result.ok && prepare ? { amendmentSha: metricRefreshDigest(result.value) } : {}), maintenance: maintenance.holder }, null, 2)}\n`);
        if (!result.ok) process.exitCode = 1;
        return;
      }
      const manifest: MetricRefreshManifest = existing ?? { version: "retained-metrics.v1", sourceBase: metricRefreshSourceBase, bounds: metricRefreshBounds, operationId,
        evidencePath: metricRefreshEvidencePath, scope, plannedAt: now.toISOString(), targets: await inventory.list(scope) };
      const currentTargets = existing && !options.has("--apply") ? await inventory.list(manifest.scope) : manifest.targets;
      const identities = (targets: typeof manifest.targets) => targets.map(targetIdentity).sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId));
      const problem = manifestProblem(manifest, now) ??
        (metricRefreshDigest(identities(currentTargets)) === metricRefreshDigest(identities(manifest.targets)) ? null : "inventory_drift");
      const manifestSha = metricRefreshDigest(manifest);
      if (problem || !options.has("--apply")) {
        if (!problem && !existing) await receipts.install(path, manifest);
        process.stdout.write(`${JSON.stringify({ mode: "dry-run", manifestSha, problem, manifest, ...(problem === "inventory_drift" ? { currentTargets } : {}) }, null, 2)}\n`);
        if (problem) process.exitCode = 1;
        return;
      }
      if (options.get("--manifest-sha") !== manifestSha) throw new Error("Reviewed manifest SHA mismatch");
      const projection = new PrismaSourceEngagementProjectionAdapter(connection.client, new CryptoIdGenerator(), {
        retention: "skip",
        sampleGuard: async (transaction, _command, sample) => {
          const expected = manifest.targets.find((target) => target.sourceItemId === sample.sourceItemId);
          const scoped = new PrismaRetainedMetricInventory(transaction as unknown as PrismaMetricInventoryClient, metricRefreshDigest);
          if (!expected || !sameTarget(expected, await scoped.read(manifest.scope, expected.sourceItemId), metricRefreshDigest)) throw new Error("Transactional target drift");
        },
      });
      let redditTokenProvider: RedditAppOnlyTokenProvider | undefined;
      const token = { getAccessToken: async () => {
        // Created lazily: a dry run never accesses OAuth or providers.
        redditTokenProvider ??= new RedditAppOnlyTokenProvider({ clientId: env.REDDIT_APP_CLIENT_ID ?? "",
          clientSecret: env.REDDIT_APP_CLIENT_SECRET ?? "", userAgent: env.REDDIT_APP_USER_AGENT,
          timeoutMs: 10_000, now: () => clock.now().getTime() });
        return redditTokenProvider.getAccessToken();
      } };
      const fetcher = new RetainedMetricFetchAdapter(new HttpHackerNewsClient(10_000), new HttpRedditClient("https://oauth.reddit.com", 10_000), token,
        env.REDDIT_APP_USER_AGENT ?? "social-monitor-retained-metrics/1");
      const result = await new RefreshRetainedMetricsUseCase(inventory, fetcher, projection, authority, clock, metricRefreshDigest).executeLocked(receipts, manifest, options.get("--manifest-sha")!);
      const report = result.ok ? { manifestSha, results: result.value, cells: summarizeMetricRefresh(result.value, manifest.scope.dates) } : { manifestSha, error: result.error };
      if (result.ok) {
        let terminal = true;
        for (const row of result.value) {
          if (await receipts.read(`${metricRefreshEvidencePath}/result-${row.sourceItemId}.json`) === null) terminal = false;
        }
        if (terminal) await receipts.install(`${metricRefreshEvidencePath}/final.json`, report);
      }
      if (!result.ok || result.value.some((row) => ["failed", "uncertain"].includes(row.status))) process.exitCode = 1;
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    });
  } finally { await connection.close(); }
  });
}
if (require.main === module) void runRetainedMetricRefresh(process.argv.slice(2), process.env).catch(() => {
  process.stderr.write("Metric refresh failed closed; preserve canonical receipts and reconcile before resuming.\n");
  process.exitCode = 1;
});
