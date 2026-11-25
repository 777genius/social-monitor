import { retainedMetricDailyGrant, retainedMetricDailyPredecessorPins as pins } from "../../domain/policies/retained-metric-daily-grant";
import { retainedMetricRenewalGrant as originalGrant } from "../../domain/policies/retained-metric-renewal-grant";
import type { MetricDailyManifest } from "./metric-daily.contracts";
import type { RefreshDigest } from "./refresh-retained-metrics.contracts";
import { assertMetricTargets, evidenceAssert, metricSha, metricUuid } from "./metric-refresh-evidence-validation";
import { metricIdentityInventory, orderedMetricTargets } from "./metric-refresh-amendment";
import { targetProblem, normalizedRefreshId } from "./metric-refresh-admission";
import { renewalOriginalAudit } from "./metric-renewal-evidence";

function exact(value: unknown, keys: string): asserts value is Record<string, unknown> {
  evidenceAssert(value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === keys.split(" ").sort().join(), "renewal_schema_invalid");
}
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function assertMetricDailyManifest(value: unknown, hash: RefreshDigest, now: Date): asserts value is MetricDailyManifest {
  exact(value, "version sourceBase bounds operationId evidencePath scope plannedAt targets predecessor capture spentRenewal");
  exact(value.spentRenewal, "manifestSha operationBytesSha finalBytesSha entryListSha");
  evidenceAssert(Object.values(value.spentRenewal).every(metricSha));
  exact(value.scope, "tenantId workspaceId dates endAt");
  evidenceAssert(Array.isArray(value.scope.dates) && value.scope.dates.length === 1);
  const grant = retainedMetricDailyGrant(String(value.scope.dates[0]));
  evidenceAssert(grant, "daily_date_not_reviewed");
  exact(value.bounds, "targets redditBatch hnBatch attempts concurrency timeoutMs");
  exact(value.predecessor, "evidencePath operationId originalManifestSha originalOperationBytesSha effectiveManifestSha finalBytesSha entriesSha originalSourceItemIds");
  exact(value.capture, "startedAt completedAt inventorySha identityInventorySha originalAudit lateArrivalSourceItemIds implementation");
  exact(value.capture.implementation, "sourceSha executableSha legacyRetirementRef holderProof");
  const impl = value.capture.implementation;
  evidenceAssert([impl.sourceSha, impl.executableSha, impl.holderProof].every(metricSha) && typeof impl.legacyRetirementRef === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9:/_.-]{0,255}$/u.test(impl.legacyRetirementRef));
  evidenceAssert(Array.isArray(value.scope.dates) && value.scope.dates.every((d) => typeof d === "string") &&
    Array.isArray(value.predecessor.originalSourceItemIds) && value.predecessor.originalSourceItemIds.every(metricUuid));
  evidenceAssert([value.predecessor.originalManifestSha, value.predecessor.originalOperationBytesSha, value.predecessor.effectiveManifestSha,
    value.predecessor.finalBytesSha, value.predecessor.entriesSha, value.capture.inventorySha, value.capture.identityInventorySha].every(metricSha));
  evidenceAssert(time(value.plannedAt) && time(value.capture.startedAt) && time(value.capture.completedAt) &&
    value.capture.startedAt >= grant.endAt && value.capture.completedAt >= value.capture.startedAt &&
    value.plannedAt === value.capture.completedAt && value.plannedAt <= now.toISOString(), "renewal_capture_time_invalid");
  assertMetricTargets(value.targets);
  const manifest = value as MetricDailyManifest;
  evidenceAssert(manifest.predecessor.evidencePath === originalGrant.predecessorPath &&
    manifest.predecessor.operationId === originalGrant.predecessorOperationId &&
    manifest.predecessor.originalManifestSha === originalGrant.predecessorManifestSha &&
    manifest.predecessor.originalSourceItemIds.length === originalGrant.originalCount &&
    new Set(manifest.predecessor.originalSourceItemIds).size === originalGrant.originalCount, "daily_original_lineage_invalid");
  const spent = pins["retained-metrics-renewal-20260908"];
  evidenceAssert(hash(manifest.spentRenewal) === hash({ manifestSha: spent.operationEnvelopeDigest,
    operationBytesSha: spent.operationBytesSha256, finalBytesSha: spent.finalBytesSha256,
    entryListSha: spent.entryListSha256 }), "daily_spent_lineage_invalid");
  evidenceAssert(hash({ version: manifest.version, evidencePath: manifest.evidencePath, operationId: manifest.operationId,
    sourceBase: manifest.sourceBase, bounds: manifest.bounds, scope: manifest.scope }) === hash({ version: grant.version,
    evidencePath: grant.evidencePath, operationId: grant.operationId, sourceBase: grant.sourceBase, bounds: grant.bounds,
    scope: { tenantId: grant.tenantId, workspaceId: grant.workspaceId, dates: grant.dates, endAt: grant.endAt } }), "renewal_fixed_admission_invalid");
  evidenceAssert(manifest.targets.every((t) => targetProblem(t, manifest.scope) === null), "renewal_target_invalid");
  evidenceAssert(new Set(manifest.targets.map((t) => t.sourceItemId)).size === manifest.targets.length &&
    new Set(manifest.targets.map((t) => `${t.providerKey}:${normalizedRefreshId(t.providerKey, t.externalId)}`)).size === manifest.targets.length, "renewal_duplicate_target");
  evidenceAssert(hash(orderedMetricTargets(manifest.targets)) === manifest.capture.inventorySha &&
    hash(metricIdentityInventory(manifest.targets)) === manifest.capture.identityInventorySha, "renewal_inventory_sha_invalid");
  evidenceAssert(Array.isArray(value.capture.originalAudit) && value.capture.originalAudit.length <= originalGrant.originalCount);
  for (const audit of value.capture.originalAudit) {
    exact(audit, "sourceItemId priorEffectiveTarget currentTarget missingReason differences");
    assertMetricTargets([audit.priorEffectiveTarget]); assertMetricTargets([audit.currentTarget]);
    evidenceAssert(audit.missingReason === null && Array.isArray(audit.differences), "renewal_original_missing_or_invalid");
    for (const diff of audit.differences) exact(diff, "field before after");
  }
  const originals = manifest.capture.originalAudit;
  evidenceAssert(hash(originals.map((a) => a.sourceItemId)) === hash(originals.map((a) => a.priorEffectiveTarget.sourceItemId).sort()) &&
    originals.every((a) => manifest.predecessor.originalSourceItemIds.includes(a.sourceItemId) && targetProblem(a.priorEffectiveTarget, manifest.scope) === null && a.sourceItemId === a.priorEffectiveTarget.sourceItemId &&
      a.currentTarget !== null && hash(metricIdentityInventory([a.currentTarget])) === hash(metricIdentityInventory(manifest.targets.filter((t) => t.sourceItemId === a.sourceItemId)))), "renewal_original_audit_invalid");
  evidenceAssert(hash(originals) === hash(renewalOriginalAudit(originals.map((a) => a.priorEffectiveTarget), originals.map((a) => a.currentTarget!), hash)), "renewal_original_diff_invalid");
  const ids = new Set(manifest.predecessor.originalSourceItemIds);
  evidenceAssert(hash(manifest.capture.lateArrivalSourceItemIds) === hash(manifest.targets.filter((t) => !ids.has(t.sourceItemId)).map((t) => t.sourceItemId).sort()), "renewal_late_arrivals_invalid");
}
