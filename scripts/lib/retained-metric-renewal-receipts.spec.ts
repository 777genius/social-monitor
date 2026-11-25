import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metricJournalPath, type MetricJournalNamespace } from "./retained-metric-journal";
import { SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";

it("has exactly two independent canonical journals, default original, with identical exclusive replay", async () => {
  const root = mkdtempSync(join(tmpdir(), "metric-two-journals-"));
  try {
    expect(metricJournalPath()).toBe("seven-day-6101-6102/retained-metrics-v1");
    expect(() => metricJournalPath("alternate" as MetricJournalNamespace)).toThrow();
    const original = SecureMetricRefreshReceipts.forTest(root), renewal = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal");
    await original.withOperation(async (prior) => renewal.withOperation(async (next) => {
      const oldPath = `${metricJournalPath()}/operation.json`, newPath = `${metricJournalPath("renewal")}/operation.json`;
      expect(await prior.install(oldPath, { fixture: "original" })).toBe("installed");
      expect(await next.install(newPath, { fixture: "renewal" })).toBe("installed");
      expect(await next.install(newPath, { fixture: "renewal" })).toBe("replayed");
      await expect(next.install(newPath, { fixture: "other" })).rejects.toThrow();
      await expect(next.read(oldPath)).rejects.toThrow(); await expect(prior.read(newPath)).rejects.toThrow();
      expect((await next.entries()).map((e) => e.name)).toEqual(["operation.json", "operation.lock"]);
      prior.assertHeld(); next.assertHeld();
    }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
it("rejects renewal depth and size overflow before creating operation.json", async () => {
  const root = mkdtempSync(join(tmpdir(), "metric-size-"));
  try {
    const renewal = SecureMetricRefreshReceipts.forTest(root, undefined, "renewal"), path = `${metricJournalPath("renewal")}/operation.json`;
    await expect(renewal.install(path, "x".repeat(16 * 1024 * 1024))).rejects.toThrow();
    let value: unknown = null; for (let i = 0; i < 33; i++) value = { nested: value };
    await expect(renewal.install(path, value)).rejects.toThrow();
    expect(await renewal.read(path)).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
