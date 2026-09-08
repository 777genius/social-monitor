import type { MetricImplementation } from "./metric-refresh-operation.contracts";
import type { MetricRefreshManifest, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";
import type { MetricRenewalAdmissionFailure } from "../../domain/policies/retained-metric-renewal-grant";

export type MetricRenewalPredecessor = {
  evidencePath: string; operationId: string; originalManifestSha: string;
  originalOperationBytesSha: string; effectiveManifestSha: string;
  finalBytesSha: string; entriesSha: string; originalSourceItemIds: readonly string[];
};
export type MetricRenewalOriginalAudit = {
  sourceItemId: string; priorEffectiveTarget: RetainedMetricTarget;
  currentTarget: RetainedMetricTarget | null; missingReason: string | null;
  differences: readonly { field: string; before: unknown; after: unknown }[];
};
export type MetricRenewalManifest = Omit<MetricRefreshManifest, "version"> & {
  version: "retained-metrics-renewal.v1";
  predecessor: MetricRenewalPredecessor;
  capture: {
    startedAt: string; completedAt: string; inventorySha: string; identityInventorySha: string;
    originalAudit: readonly MetricRenewalOriginalAudit[];
    lateArrivalSourceItemIds: readonly string[]; implementation: MetricImplementation;
  };
};
export type MetricRenewalFailure = { code: MetricRenewalAdmissionFailure | "renewal_evidence_invalid" |
  "renewal_inventory_drift" | "renewal_original_missing_or_invalid" | "renewal_execution_refused"; detail: string; originalAudit?: readonly MetricRenewalOriginalAudit[] };
