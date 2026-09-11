import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retainedMetricDailyAuthorities } from "@social-monitor/ingestion/domain/policies/retained-metric-daily-grant";
import { dailyPredecessorEntryList } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-daily-evidence";
import { SecureMetricRefreshReceipts, metricRefreshDigest as hash } from "./retained-metric-refresh-receipts";
import { metricJournalPath, type MetricJournalNamespace } from "./retained-metric-journal";

jest.setTimeout(120_000);
const date = "2026-09-02", path = `${metricJournalPath(date)}/operation.json`;
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "metric-daily-durable-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));
function child(mode: string) {
  return spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", "-e", `
    const { SecureMetricRefreshReceipts } = require('./scripts/lib/retained-metric-refresh-receipts');
    const receipts = SecureMetricRefreshReceipts.forTest(process.argv[1], (point, name) => {
      if (name === 'operation.json' && point === process.argv[2]) process.kill(process.pid, 'SIGKILL');
    }, '2026-09-02');
    receipts.install(${JSON.stringify(path)}, {fixture: 'daily'}).then(() => process.exit(0)).catch(() => process.exit(2));
  `, root, mode], { env: { ...process.env, NODE_ENV: "test", NODE_OPTIONS: "--max-old-space-size=1536", TS_NODE_PROJECT: "tsconfig.build.json" }, timeout: 60000 });
}
it("keeps seven closed daily namespaces separate from original and fixed-v1 and fences a competing process", async () => {
  const original = SecureMetricRefreshReceipts.forTest(root), spent = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal");
  await original.install(`${metricJournalPath()}/operation.json`, { fixture: "original" });
  await spent.install(`${metricJournalPath("renewal")}/operation.json`, { fixture: "spent" });
  const oldBytes = readFileSync(join(root, metricJournalPath(), "operation.json"));
  const spentBytes = readFileSync(join(root, metricJournalPath("renewal"), "operation.json"));
  for (const a of retainedMetricDailyAuthorities) {
    const daily = SecureMetricRefreshReceipts.forTest(root, undefined, a.date);
    await daily.withOperation(async (o) => {
      await o.install(`${a.evidencePath}/operation.json`, { fixture: a.date });
      await expect(o.read(`${metricJournalPath()}/operation.json`)).rejects.toThrow();
      await expect(o.install(`${metricJournalPath("renewal")}/operation.json`, {})).rejects.toThrow();
      const other = retainedMetricDailyAuthorities.find((b) => b.date !== a.date)!;
      await expect(o.install(`${other.evidencePath}/operation.json`, {})).rejects.toThrow();
      if (a.date === date) expect(child("none").status).toBe(2);
    });
  }
  expect(() => metricJournalPath("2026-09-06" as MetricJournalNamespace)).toThrow();
  expect(readFileSync(join(root, metricJournalPath(), "operation.json"))).toEqual(oldBytes);
  expect(readFileSync(join(root, metricJournalPath("renewal"), "operation.json"))).toEqual(spentBytes);
});
it.each(["file_partial", "directory_synced"])("retains SIGKILL at %s and only adopts complete bytes", async (point) => {
  expect(child(point).signal).toBe("SIGKILL");
  const bytes = readFileSync(join(root, path));
  const daily = SecureMetricRefreshReceipts.forTest(root, undefined, date);
  if (point === "file_partial") await expect(daily.read(path)).rejects.toThrow();
  else expect(await daily.install(path, { fixture: "daily" })).toBe("replayed");
  expect(readFileSync(join(root, path))).toEqual(bytes);
});
it("rejects deep and oversized daily manifests before installing the authority name", async () => {
  const daily = SecureMetricRefreshReceipts.forTest(root, undefined, date);
  await expect(daily.install(path, "x".repeat(16 * 1024 * 1024))).rejects.toThrow();
  let deep: unknown = null; for (let i = 0; i < 33; i++) deep = { child: deep };
  await expect(daily.install(path, deep)).rejects.toThrow();
  expect(readdirSync(join(root, metricJournalPath(date)))).toEqual(["operation.lock"]);
});
it("encodes predecessor entries with explicit sha256 keys and ASCII filename ordering", () => {
  const entries = [{ name: "batch-2.reserved.json", bytesSha: "b".repeat(64) }, { name: "batch-10.reserved.json", bytesSha: "a".repeat(64) }];
  expect(dailyPredecessorEntryList(entries)).toEqual([{ name: "batch-10.reserved.json", sha256: "a".repeat(64) }, { name: "batch-2.reserved.json", sha256: "b".repeat(64) }]);
  expect(hash(dailyPredecessorEntryList(entries))).not.toBe(hash(entries));
});
