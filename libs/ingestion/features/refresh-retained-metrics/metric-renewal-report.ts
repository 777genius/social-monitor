import type { MetricRefreshOutcome } from "./refresh-retained-metrics.contracts";
import { metricRefreshCells } from "./metric-refresh-report";

// Renewal owns this richer evidence shape. Historical v1 cells stay byte-identical.
export function metricRenewalCells(results: readonly MetricRefreshOutcome[], dates: readonly string[]) {
  return metricRefreshCells(results, dates).map((cell) => ({ ...cell,
    authorities: results.filter((r) => r.date === cell.date && r.providerKey === cell.provider).map((r) => ({
      sourceItemId: r.sourceItemId, externalId: r.externalId, observedAt: r.observedAt,
      before: r.before, after: r.after,
    })),
  }));
}
