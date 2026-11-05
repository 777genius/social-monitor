import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { RenewDailyRetainedMetricsUseCase } from "./renew-daily-retained-metrics.use-case";
import { RenewalMemoryJournal, implementation } from "../../../../scripts/lib/retained-metric-renewal.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { retainedMetricRenewalGrant as spentGrant } from "../../domain/policies/retained-metric-renewal-grant";
import { retainedMetricDailyGrant } from "../../domain/policies/retained-metric-daily-grant";

it("never purchases inventory or metrics without canonical predecessor admission", async () => {
  for (const date of ["2026-09-02", "2026-09-06"]) {
  const original = new RenewalMemoryJournal(spentGrant.predecessorPath), spent = new RenewalMemoryJournal(spentGrant.evidencePath);
  const daily = new RenewalMemoryJournal(retainedMetricDailyGrant("2026-09-02")!.evidencePath);
  const inventory = { list: jest.fn(async () => []), read: jest.fn(async () => null) };
  const fetcher = { fetch: jest.fn(async () => ok([])) };
  const projection = { project: jest.fn(async () => ({ currentSnapshotsUpdated: 0, observationsAppended: 0, metricChanges: 0, regressionsObserved: 0 })) };
  const usecase = new RenewDailyRetainedMetricsUseCase(date, inventory, fetcher, projection, original, spent, daily,
    new FixedClock(new Date("2026-09-09T12:00:00.000Z")), metricRefreshDigest);
  expect(await usecase.prepare(implementation)).toMatchObject({ ok: false });
  expect(await usecase.execute("f".repeat(64))).toMatchObject({ ok: false });
  expect(inventory.list).not.toHaveBeenCalled(); expect(fetcher.fetch).not.toHaveBeenCalled(); expect(projection.project).not.toHaveBeenCalled();
  expect(original.values.size + spent.values.size + daily.values.size).toBe(0);
  expect(original.held || spent.held || daily.held).toBe(false);
  }
});
