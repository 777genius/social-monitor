import type { MetricRefreshOutcome } from "./refresh-retained-metrics.contracts";
import { metricRefreshDates } from "./metric-refresh-admission";

export function metricRefreshCells(results: readonly MetricRefreshOutcome[], dates: readonly string[] = metricRefreshDates) {
  return dates.flatMap((date) => ["hacker-news", "reddit"].map((provider) => {
    const rows = results.filter((row) => row.date === date && row.providerKey === provider);
    return { date, provider, targets: rows.length, returned: rows.filter((row) => row.returned).length,
      ...Object.fromEntries(["refreshed", "superseded", "unavailable", "failed", "uncertain"].map((status) => [status, rows.filter((row) => row.status === status).length])),
      beforeObservations: rows.reduce((sum, row) => sum + row.before.observationCount, 0),
      afterObservations: rows.reduce((sum, row) => sum + row.after.observationCount, 0),
      authorityTimes: rows.map((row) => ({ id: row.externalId, before: row.before.observationAt, after: row.after.observationAt })) };
  }));
}
