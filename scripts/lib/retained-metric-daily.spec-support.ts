import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { retainedMetricDailyGrant, retainedMetricDailyPredecessorPins as pins } from "@social-monitor/ingestion/domain/policies/retained-metric-daily-grant";
import { retainedMetricRenewalGrant as spentGrant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import { RenewDailyRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-daily-retained-metrics.use-case";
import { dailyPredecessorEntryList } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-daily-evidence";
import { refreshBatches } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import { metricRenewalCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-renewal-report";
import type { MetricRefreshOutcome, RefreshScope, RetainedMetricTarget, RetainedMetricFetchCapability } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { implementation, renewalFixture, RenewalMemoryJournal } from "./retained-metric-renewal.spec-support";
import { metricRefreshDigest } from "./retained-metric-refresh-receipts";

export const dailyDate = "2026-09-02";
export const dailyGrant = retainedMetricDailyGrant(dailyDate)!;
// Synthetic receipts exercise real original, fixed-v1, daily and effect resolvers.
// Only exact synthetic payload/byte digests substitute the supplied incident pins.
function pinBytes(journal: RenewalMemoryJournal, pin: typeof pins[keyof typeof pins]) {
  const entries = journal.entries.bind(journal);
  journal.entries = async () => (await entries()).map((e) => ({ ...e, bytesSha: e.name === "operation.json" ? pin.operationBytesSha256 :
    e.name === "final.json" ? pin.finalBytesSha256 : e.bytesSha }));
}
export async function dailyFixture() {
  const f = renewalFixture();
  pinBytes(f.prior, pins["retained-metrics-v1"]);
  const prepared = await f.usecase().prepare(implementation);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const manifest = prepared.value, manifestSha = pins["retained-metrics-renewal-20260908"].operationEnvelopeDigest;
  const results: MetricRefreshOutcome[] = [];
  for (const [index, batch] of refreshBatches(manifest.targets).entries()) {
    f.renewal.values.set(`${f.renewal.root}/batch-${index}.reserved.json`, { operationId: manifest.operationId, manifestDigest: manifestSha, targets: batch.map((t) => t.sourceItemId) });
    f.renewal.values.set(`${f.renewal.root}/batch-${index}.observed.json`, { failure: null, observations: batch.map((t) => ({ externalId: t.externalId,
      returned: false, observedAt: manifest.plannedAt, metadata: null, sample: null, reason: "omitted" })) });
    for (const t of batch) {
      const result: MetricRefreshOutcome = { manifestSha, sourceItemId: t.sourceItemId, externalId: t.externalId, providerKey: t.providerKey,
        date: t.publishedAt.slice(0, 10), status: "unavailable", returned: false, reason: "omitted", observedAt: manifest.plannedAt, before: t.authority, after: t.authority };
      f.renewal.values.set(`${f.renewal.root}/result-${t.sourceItemId}.json`, result); results.push(result);
    }
  }
  f.renewal.values.set(`${f.renewal.root}/final.json`, { manifestSha, results, cells: metricRenewalCells(results, spentGrant.dates) });
  pinBytes(f.renewal, pins["retained-metrics-renewal-20260908"]);
  const aliases = new Map<string, string>([[metricRefreshDigest(manifest), manifestSha]]);
  for (const [journal, pin] of [[f.prior, pins["retained-metrics-v1"]], [f.renewal, pins["retained-metrics-renewal-20260908"]]] as const) {
    await journal.withOperation(async () => aliases.set(metricRefreshDigest(dailyPredecessorEntryList(await journal.entries())), pin.entryListSha256));
  }
  const hash = (value: unknown) => aliases.get(metricRefreshDigest(value)) ?? f.hash(value);
  const daily = new RenewalMemoryJournal(dailyGrant.evidencePath);
  let current = structuredClone(f.targets);
  const inventory = {
    list: jest.fn(async (scope: RefreshScope, ids?: readonly string[]) => structuredClone(current.filter((t) => ids ? ids.includes(t.sourceItemId) : scope.dates.includes(t.publishedAt.slice(0, 10))))),
    read: jest.fn(async (_scope: RefreshScope, id: string) => structuredClone(current.find((t) => t.sourceItemId === id) ?? null)),
  };
  const fetcher = { fetch: jest.fn(async (batch: readonly RetainedMetricTarget[]): ReturnType<RetainedMetricFetchCapability["fetch"]> => ok(batch.map((t) => ({ externalId: t.externalId, returned: false, metadata: null, reason: "omitted" })))) };
  const projection = f.projection;
  const clock = new FixedClock(new Date("2026-09-09T12:00:00.000Z"));
  const usecase = () => new RenewDailyRetainedMetricsUseCase(dailyDate, inventory, fetcher, projection, f.prior, f.renewal, daily, clock, hash);
  return { ...f, hash, daily, inventory, fetcher, projection, clock, usecase,
    setCurrent: (rows: RetainedMetricTarget[]) => { current = rows; } };
}
