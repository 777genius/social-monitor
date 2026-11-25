import type { MetricRefreshManifest, MetricRefreshReceipts, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";

export type MetricEvidenceEntry = { name: string; bytesSha: string };
export type MetricImplementation = {
  sourceSha: string; executableSha: string; legacyRetirementRef: string; holderProof: string;
};
export interface MetricRefreshOperation extends MetricRefreshReceipts {
  // A live lease, never a persisted marker. All I/O and effects require it.
  assertHeld(): void;
  entries(): Promise<readonly MetricEvidenceEntry[]>;
}
export interface MetricRefreshOperationAuthority extends MetricRefreshReceipts {
  withOperation<T>(work: (operation: MetricRefreshOperation) => Promise<T>): Promise<T>;
}
export type MetricContentChange = { sourceItemId: string; before: string; after: string };
export type MetricManifestAmendment = {
  version: "retained-metrics-amendment.v1"; operationId: string; evidencePath: string;
  originalManifestSha: string; originalOperationBytesSha: string;
  sequence: number; previousAmendmentSha: string | null; priorEffectiveSha: string;
  captureStartedAt: string; captureCompletedAt: string; reason: string;
  implementation: MetricImplementation; inventory: readonly RetainedMetricTarget[];
  inventorySha: string; identityInventorySha: string; changes: readonly MetricContentChange[];
  effectiveManifestSha: string; zeroBudgetEvidence: readonly MetricEvidenceEntry[]; zeroBudgetEvidenceSha: string;
};
export type MetricOperationHead = {
  original: MetricRefreshManifest; effective: MetricRefreshManifest;
  originalOperationBytesSha: string; sequence: number; amendmentSha: string | null;
};
