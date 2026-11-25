import { metricRenewalCells } from "./metric-renewal-report";
import { metricRefreshCells } from "./metric-refresh-report";
import type { MetricRefreshOutcome } from "./refresh-retained-metrics.contracts";
import { target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

it("reports equal-counter snapshot freshness separately from cadence and superseding authority in all 14 cells", () => {
  const t = target(), before = { ...t.authority, metricsHash: "a".repeat(64), observedAt: "2026-09-08T11:00:00.000Z",
    observationAt: "2026-09-08T10:00:00.000Z", observationCount: 2 };
  const row: MetricRefreshOutcome = { sourceItemId: t.sourceItemId, externalId: t.externalId, providerKey: t.providerKey,
    date: "2026-09-04", status: "refreshed", returned: true, reason: null, observedAt: "2026-09-08T12:00:00.000Z",
    before, after: { ...before, observedAt: "2026-09-08T12:00:00.000Z" } };
  const superseded = { ...row, sourceItemId: "late-id", status: "superseded" as const,
    after: { ...row.after, metricsHash: "b".repeat(64), observedAt: "2026-09-08T12:01:00.000Z", observationCount: 3 } };
  const dates = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
  const cells = metricRenewalCells([row, superseded], dates);
  expect(cells).toHaveLength(14);
  const cell = cells.find((c) => c.date === row.date && c.provider === "reddit")!;
  expect(cell.authorities).toEqual([row, superseded].map((r) => ({ sourceItemId: r.sourceItemId, externalId: r.externalId,
    observedAt: r.observedAt, before: r.before, after: r.after })));
  expect(cell.beforeObservations).toBe(4); expect(cell.afterObservations).toBe(5);
  expect(cell.authorities[0]!.after.observationAt).not.toBe(cell.authorities[0]!.after.observedAt);
  expect(metricRefreshCells([row], dates).every((c) => !("authorities" in c))).toBe(true);
});
