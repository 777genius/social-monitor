import type { MetricImplementation } from "./metric-refresh-operation.contracts";
import type { MetricRefreshManifest } from "./refresh-retained-metrics.contracts";


import type { MetricRenewalPredecessor, MetricRenewalOriginalAudit } from "./metric-renewal.contracts";
export type MetricDailyManifest = Omit<MetricRefreshManifest, "version"> & {
  version: "retained-metrics-daily.v1";
  predecessor: MetricRenewalPredecessor;
  spentRenewal: { manifestSha: string; operationBytesSha: string; finalBytesSha: string; entryListSha: string };
  capture: {
    startedAt: string; completedAt: string; inventorySha: string; identityInventorySha: string;
    originalAudit: readonly MetricRenewalOriginalAudit[];
    lateArrivalSourceItemIds: readonly string[]; implementation: MetricImplementation;
  };
};
