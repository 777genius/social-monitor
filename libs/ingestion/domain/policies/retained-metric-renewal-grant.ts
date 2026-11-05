// One incident allowance. The source base identifies review ancestry, never the
// deployed executable; release identity is separately bound in capture evidence.
export const retainedMetricRenewalGrant = {
  version: "retained-metrics-renewal.v1",
  evidencePath: "seven-day-6101-6102/retained-metrics-renewal-20260908",
  operationId: "c7fd60f4-c790-5d77-8a72-654fc87701f7",
  sourceBase: "ad58aae7ca3e7fda6c705ee2d91b25388a78b374",
  predecessorPath: "seven-day-6101-6102/retained-metrics-v1",
  predecessorOperationId: "409f3cde-6073-451c-9285-eaa6802ca081",
  predecessorManifestSha: "0f9fa678de1921b4847ab8f0224f96e4c367308bd56604d999cd670c16b8949a",
  originalCount: 3329,
  tenantId: "00000000-0000-7000-8000-000000006101",
  workspaceId: "00000000-0000-7000-8000-000000006102",
  dates: ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
  endAt: "2026-09-06T00:00:00.000Z",
  bounds: { targets: 10_000, redditBatch: 100, hnBatch: 1, attempts: 1, concurrency: 1, timeoutMs: 10_000 },
} as const;

export type MetricRenewalAdmissionFailure =
  | "renewal_fixed_grant_mismatch" | "renewal_predecessor_mismatch"
  | "renewal_scope_mismatch" | "renewal_bounds_mismatch";

type GrantCandidate = {
  version: string; evidencePath: string; operationId: string; sourceBase: string;
  scope: { tenantId: string; workspaceId: string; dates: readonly string[]; endAt: string };
  bounds: Readonly<Record<keyof typeof retainedMetricRenewalGrant.bounds, number>>;
  predecessor: { evidencePath: string; operationId: string; originalManifestSha: string; originalSourceItemIds: readonly string[] };
};
export function retainedMetricRenewalGrantProblem(value: GrantCandidate): MetricRenewalAdmissionFailure | null {
  const fixed = retainedMetricRenewalGrant;
  if (value.version !== fixed.version || value.evidencePath !== fixed.evidencePath ||
      value.operationId !== fixed.operationId || value.sourceBase !== fixed.sourceBase) return "renewal_fixed_grant_mismatch";
  if (value.scope.tenantId !== fixed.tenantId || value.scope.workspaceId !== fixed.workspaceId ||
      value.scope.endAt !== fixed.endAt || value.scope.dates.join() !== fixed.dates.join()) return "renewal_scope_mismatch";
  if (Object.keys(value.bounds).sort().join() !== Object.keys(fixed.bounds).sort().join() ||
      Object.entries(fixed.bounds).some(([key, bound]) => value.bounds[key as keyof typeof fixed.bounds] !== bound)) return "renewal_bounds_mismatch";
  const prior = value.predecessor;
  if (prior.evidencePath !== fixed.predecessorPath || prior.operationId !== fixed.predecessorOperationId ||
      prior.originalManifestSha !== fixed.predecessorManifestSha || prior.originalSourceItemIds.length !== fixed.originalCount ||
      new Set(prior.originalSourceItemIds).size !== fixed.originalCount) return "renewal_predecessor_mismatch";
  return null;
}
