import type { MetricRefreshManifest, MetricAuthority, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";
import type { MetricManifestAmendment } from "./metric-refresh-operation.contracts";
import { manifestProblem, metricRefreshTargetLimit } from "./metric-refresh-admission";

export const metricAmendmentLimit = 8;
export const metricProposalLimit = 8;
export const metricSha = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
export const metricUuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const time = (v: unknown): boolean => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const count = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function evidenceAssert(valid: unknown, reason = "invalid_metric_evidence"): asserts valid {
  if (!valid) throw new Error(reason);
}
function object(value: unknown, keys: string): asserts value is Record<string, unknown> {
  evidenceAssert(value !== null && typeof value === "object" && !Array.isArray(value));
  evidenceAssert(Object.keys(value).sort().join() === keys.split(" ").sort().join());
}
export function assertMetricAuthority(value: unknown): asserts value is MetricAuthority {
  object(value, "metricsHash observedAt observationAt observationCount regressionCount");
  evidenceAssert((value.metricsHash === null || metricSha(value.metricsHash)) &&
    (value.observedAt === null || time(value.observedAt)) && (value.observationAt === null || time(value.observationAt)) &&
    count(value.observationCount) && count(value.regressionCount) && Number(value.regressionCount) <= Number(value.observationCount));
}
export function assertMetricTargets(value: unknown): asserts value is readonly RetainedMetricTarget[] {
  evidenceAssert(Array.isArray(value) && value.length <= metricRefreshTargetLimit);
  for (const row of value) {
    object(row, "sourceItemId externalId sourceBindingId providerKey canonicalUrl publishedAt tenantId workspaceId configDigest identityDigest feedDigest visibleFeedCount rejection authority");
    evidenceAssert([row.sourceItemId, row.sourceBindingId, row.tenantId, row.workspaceId].every(metricUuid) &&
      [row.configDigest, row.identityDigest, row.feedDigest].every(metricSha) &&
      ["hacker-news", "reddit"].includes(String(row.providerKey)) && typeof row.externalId === "string" &&
      typeof row.canonicalUrl === "string" && time(row.publishedAt) && count(row.visibleFeedCount) &&
      (row.rejection === null || typeof row.rejection === "string"));
    assertMetricAuthority(row.authority);
  }
}
export function assertMetricManifest(value: unknown, now: Date): asserts value is MetricRefreshManifest {
  object(value, "version sourceBase bounds operationId evidencePath scope plannedAt targets");
  object(value.bounds, "targets redditBatch hnBatch attempts concurrency timeoutMs");
  object(value.scope, "tenantId workspaceId dates endAt");
  evidenceAssert(Array.isArray(value.scope.dates) && value.scope.dates.every((date) => typeof date === "string") && time(value.scope.endAt) && time(value.plannedAt));
  assertMetricTargets(value.targets);
  evidenceAssert(manifestProblem(value as MetricRefreshManifest, now) === null, "invalid_original_manifest");
}
export function assertMetricAmendment(value: unknown): asserts value is MetricManifestAmendment {
  object(value, "version operationId evidencePath originalManifestSha originalOperationBytesSha sequence previousAmendmentSha priorEffectiveSha captureStartedAt captureCompletedAt reason implementation inventory inventorySha identityInventorySha changes effectiveManifestSha zeroBudgetEvidence zeroBudgetEvidenceSha");
  evidenceAssert(value.version === "retained-metrics-amendment.v1" && metricUuid(value.operationId) &&
    typeof value.evidencePath === "string" && count(value.sequence) && Number(value.sequence) >= 1 && Number(value.sequence) <= metricAmendmentLimit &&
    [value.originalManifestSha, value.originalOperationBytesSha, value.priorEffectiveSha, value.inventorySha, value.identityInventorySha, value.effectiveManifestSha, value.zeroBudgetEvidenceSha].every(metricSha) &&
    (value.previousAmendmentSha === null || metricSha(value.previousAmendmentSha)) && time(value.captureStartedAt) && time(value.captureCompletedAt) &&
    String(value.captureStartedAt) <= String(value.captureCompletedAt) && typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 1000);
  object(value.implementation, "sourceSha executableSha legacyRetirementRef holderProof");
  evidenceAssert(metricSha(value.implementation.sourceSha) && metricSha(value.implementation.executableSha) && metricSha(value.implementation.holderProof) &&
    typeof value.implementation.legacyRetirementRef === "string" && /^[A-Za-z0-9][A-Za-z0-9:/_.-]{0,255}$/u.test(value.implementation.legacyRetirementRef));
  assertMetricTargets(value.inventory);
  evidenceAssert(Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= 16);
  for (const row of value.changes) {
    object(row, "sourceItemId before after");
    evidenceAssert(metricUuid(row.sourceItemId) && metricSha(row.before) && metricSha(row.after) && row.before !== row.after);
  }
  evidenceAssert(Array.isArray(value.zeroBudgetEvidence) && value.zeroBudgetEvidence.length <= 2 + metricAmendmentLimit + metricProposalLimit);
  for (const entry of value.zeroBudgetEvidence) {
    object(entry, "name bytesSha");
    evidenceAssert(typeof entry.name === "string" && metricSha(entry.bytesSha) &&
      /^(?:operation\.json|operation\.lock|proposal-[a-f0-9]{64}\.json|amendment-00000[1-8]\.json)$/u.test(entry.name));
  }
}
