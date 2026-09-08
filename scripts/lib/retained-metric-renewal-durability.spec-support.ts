import type { MetricRefreshOperation, MetricRefreshOperationAuthority } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import type { ProjectSourceEngagementCommand } from "@social-monitor/ingestion/ports/source-engagement-projection.port";
import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RenewRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import type { MetricRefreshManifest, RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { RetainedMetricFetchAdapter } from "@social-monitor/ingestion/adapters/source/retained-metric-fetch.capability";
import { metricRefreshDigest, SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";

// Disposable fake-provider process, no runtime/DB/provider composition.
async function main() {
  if (process.env.NODE_ENV !== "test" || !process.send) throw new Error("TEST IPC required");
  const root = process.argv[2]!, mode = process.argv[3]!;
  const original = JSON.parse(readFileSync(join(root, grant.predecessorPath, "operation.json"), "utf8")).value as MetricRefreshManifest;
  const originalHash = metricRefreshDigest(original);
  const hash = (v: unknown) => metricRefreshDigest(v) === originalHash ? grant.predecessorManifestSha : metricRefreshDigest(v);
  const prior = SecureMetricRefreshReceipts.forTest(root), renewal = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal");
  const log = (effect: string) => appendFileSync(join(root, "effects.log"), `${effect}\n`);
  let cached: RetainedMetricTarget[] | undefined;
  const current = () => cached ??= JSON.parse(readFileSync(join(root, "current.json"), "utf8")) as RetainedMetricTarget[];
  const inventory = { list: async () => { log("inventory"); return current(); },
    read: async (_: unknown, id: string) => { log("read"); return current().find((t) => t.sourceItemId === id) ?? null; } };
  const unknown = async () => { log("provider"); throw new DOMException("fixture timeout", "TimeoutError"); };
  const adapter = new RetainedMetricFetchAdapter({ getStory: unknown }, { getPostsByIds: unknown }, { getAccessToken: async () => "fixture-token" }, "fixture-agent");
  const fetcher = { fetch: async (targets: readonly RetainedMetricTarget[]) => {
    if (mode === "unknown") return adapter.fetch(targets);
    log("provider");
    return ok(targets.map((t) => ({ externalId: t.externalId, returned: true, reason: null,
      metadata: t.sourceItemId === original.targets[0]!.sourceItemId ? { kind: "reddit_post", score: 42, numComments: 9 } : null })));
  } };
  const clock = new FixedClock(new Date("2026-09-08T12:00:00.000Z"));
  const projection = { project: async (command: ProjectSourceEngagementCommand) => {
    log("projection");
    const sample = command.samples[0];
    if (!sample?.sourceItemId) throw new Error("fixture projection requires sourceItemId");
    const rows = current();
    const target = rows.find((t) => t.sourceItemId === sample.sourceItemId)!;
    target.authority = { metricsHash: sample.metricsFingerprint, observedAt: command.observedAt.toISOString(),
      observationAt: command.observedAt.toISOString(), observationCount: 1, regressionCount: 0 };
    writeFileSync(join(root, "current.json"), JSON.stringify(rows));
    if (mode === "lost-ack") process.kill(process.pid, "SIGKILL");
    return { currentSnapshotsUpdated: 1, observationsAppended: 1, metricChanges: 1, regressionsObserved: 0 };
  } };
  const wrapped: MetricRefreshOperationAuthority = {
    read: <T>(path: string) => renewal.read<T>(path),
    install: (path, value) => renewal.install(path, value),
    withOperation: <T>(work: (operation: MetricRefreshOperation) => Promise<T>) => renewal.withOperation((o) => work({ ...o,
    install: async (path, value) => {
      log("install");
      if (mode === "result-loss" && path.includes("/result-")) process.kill(process.pid, "SIGKILL");
      const result = await o.install(path, value);
      if (mode === "result-ack" && path.includes("/result-")) process.kill(process.pid, "SIGKILL");
      return result;
    } })) };
  const manifest = await renewal.read(`${grant.evidencePath}/operation.json`);
  return new RenewRetainedMetricsUseCase(inventory, fetcher, projection, prior, wrapped, clock, hash).execute(hash(manifest));
}
if (require.main === module) void main().then((result) => {
  process.send!({ result: { ok: result.ok, terminal: result.ok && "results" in result.value, digest: metricRefreshDigest(result) } }, () => process.disconnect());
}).catch((error: unknown) => {
  process.exitCode = 1;
  process.send!({ error: error instanceof Error ? error.message : "failure" }, () => process.disconnect());
});
