// Subprocess driver for disposable TEST directories only; never a production entrypoint.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FixedClock, ok } from "@social-monitor/shared-kernel";
import type { MetricManifestAmendment } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import type { MetricRefreshManifest, RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { AmendRetainedMetricManifestUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case";
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";
import { metricRefreshDigest, SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";

export type MetricProcessInput = {
  action: "apply" | "commit"; manifest: MetricRefreshManifest; proposal?: MetricManifestAmendment;
  pauseName?: string; killPoint?: string; killName?: string;
};
async function main() {
  if (process.env.NODE_ENV !== "test" || !process.send) throw new Error("TEST IPC required");
  const root = process.argv[2]!, input = JSON.parse(readFileSync(process.argv[3]!, "utf8")) as MetricProcessInput;
  const inventory = {
    list: async () => JSON.parse(readFileSync(join(root, "current.json"), "utf8")) as RetainedMetricTarget[],
    read: async (_: unknown, id: string) => (await inventory.list()).find((t) => t.sourceItemId === id) ?? null,
  };
  const receipts = SecureMetricRefreshReceipts.forTest(root, (point, name) => {
    if (input.killPoint === point && input.killName === name) process.kill(process.pid, "SIGKILL");
  });
  const authority = { read: receipts.read.bind(receipts), install: receipts.install.bind(receipts),
    withOperation: <T>(work: Parameters<typeof receipts.withOperation<T>>[0]) => receipts.withOperation((o) => work({ ...o,
      install: async (path, value) => {
        if (path.endsWith(`/${input.pauseName}`)) {
          process.send!({ paused: input.pauseName });
          await new Promise<void>((resolve) => process.once("message", () => resolve()));
        }
        const result = await o.install(path, value);
        if (input.killPoint === "install_ack" && path.endsWith(`/${input.killName}`)) process.kill(process.pid, "SIGKILL");
        return result;
      } })) };
  const clock = new FixedClock(new Date("2026-09-06T04:00:00.000Z"));
  if (input.action === "commit") {
    const p = input.proposal!;
    return new AmendRetainedMetricManifestUseCase(inventory, authority, clock, metricRefreshDigest, p.implementation)
      .commit(metricRefreshDigest(p), p.priorEffectiveSha, p.effectiveManifestSha);
  }
  const fetcher = { fetch: async () => {
    appendFileSync(join(root, "fetches.log"), "fetch\n");
    if (input.killPoint === "fetch") process.kill(process.pid, "SIGKILL");
    return ok([]);
  } };
  return new RefreshRetainedMetricsUseCase(inventory, fetcher, { project: async () => { throw new Error("No sample expected"); } }, authority, clock, metricRefreshDigest)
    .execute(input.manifest);
}
if (require.main === module) void main().then((result) => {
  process.send!({ result }); process.disconnect();
}).catch((e: unknown) => {
  process.send!({ error: e instanceof Error ? e.message : String(e) }); process.disconnect(); process.exitCode = 1;
});
