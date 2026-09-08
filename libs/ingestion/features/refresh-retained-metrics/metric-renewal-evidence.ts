import { retainedMetricRenewalGrant as grant, retainedMetricRenewalGrantProblem } from "../../domain/policies/retained-metric-renewal-grant";
import type { MetricRenewalManifest, MetricRenewalOriginalAudit, MetricRenewalPredecessor } from "./metric-renewal.contracts";
import type { MetricRefreshOperation, MetricEvidenceEntry } from "./metric-refresh-operation.contracts";
import type { RefreshDigest, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";
import { assertMetricTargets, evidenceAssert, metricSha, metricUuid } from "./metric-refresh-evidence-validation";
import { metricIdentityInventory, orderedMetricTargets, resolveMetricOperation } from "./metric-refresh-amendment";
import { targetProblem, normalizedRefreshId } from "./metric-refresh-admission";
import { validateExecutedMetricEffects } from "./metric-refresh-effect-evidence";

function exact(value: unknown, keys: string): asserts value is Record<string, unknown> {
  evidenceAssert(value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === keys.split(" ").sort().join(), "renewal_schema_invalid");
}
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function renewalOriginalAudit(prior: readonly RetainedMetricTarget[], current: readonly RetainedMetricTarget[], hash: RefreshDigest): MetricRenewalOriginalAudit[] {
  return orderedMetricTargets(prior).map((before) => {
    const after = current.find((t) => t.sourceItemId === before.sourceItemId) ?? null;
    return { sourceItemId: before.sourceItemId, priorEffectiveTarget: before, currentTarget: after,
      missingReason: after === null ? "original_missing" : null,
      differences: Object.keys(before).sort().flatMap((field) => {
        const oldValue = before[field as keyof RetainedMetricTarget], newValue = after?.[field as keyof RetainedMetricTarget] ?? null;
        return hash(oldValue) === hash(newValue) ? [] : [{ field, before: oldValue, after: newValue }];
      }) };
  });
}
export function assertMetricRenewalManifest(value: unknown, hash: RefreshDigest, now: Date): asserts value is MetricRenewalManifest {
  exact(value, "version sourceBase bounds operationId evidencePath scope plannedAt targets predecessor capture");
  exact(value.bounds, "targets redditBatch hnBatch attempts concurrency timeoutMs");
  exact(value.scope, "tenantId workspaceId dates endAt");
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
  const manifest = value as MetricRenewalManifest;
  evidenceAssert(retainedMetricRenewalGrantProblem(manifest) === null, "renewal_fixed_admission_invalid");
  evidenceAssert(manifest.targets.every((t) => targetProblem(t, manifest.scope) === null), "renewal_target_invalid");
  evidenceAssert(new Set(manifest.targets.map((t) => t.sourceItemId)).size === manifest.targets.length &&
    new Set(manifest.targets.map((t) => `${t.providerKey}:${normalizedRefreshId(t.providerKey, t.externalId)}`)).size === manifest.targets.length, "renewal_duplicate_target");
  evidenceAssert(hash(orderedMetricTargets(manifest.targets)) === manifest.capture.inventorySha &&
    hash(metricIdentityInventory(manifest.targets)) === manifest.capture.identityInventorySha, "renewal_inventory_sha_invalid");
  evidenceAssert(Array.isArray(value.capture.originalAudit) && value.capture.originalAudit.length === grant.originalCount);
  for (const audit of value.capture.originalAudit) {
    exact(audit, "sourceItemId priorEffectiveTarget currentTarget missingReason differences");
    assertMetricTargets([audit.priorEffectiveTarget]); assertMetricTargets([audit.currentTarget]);
    evidenceAssert(audit.missingReason === null && Array.isArray(audit.differences), "renewal_original_missing_or_invalid");
    for (const diff of audit.differences) exact(diff, "field before after");
  }
  const originals = manifest.capture.originalAudit;
  evidenceAssert(hash(originals.map((a) => a.sourceItemId)) === hash([...manifest.predecessor.originalSourceItemIds].sort()) &&
    originals.every((a) => a.sourceItemId === a.priorEffectiveTarget.sourceItemId &&
      a.currentTarget !== null && hash(metricIdentityInventory([a.currentTarget])) === hash(metricIdentityInventory(manifest.targets.filter((t) => t.sourceItemId === a.sourceItemId)))), "renewal_original_audit_invalid");
  evidenceAssert(hash(originals) === hash(renewalOriginalAudit(originals.map((a) => a.priorEffectiveTarget), originals.map((a) => a.currentTarget!), hash)), "renewal_original_diff_invalid");
  const ids = new Set(manifest.predecessor.originalSourceItemIds);
  evidenceAssert(hash(manifest.capture.lateArrivalSourceItemIds) === hash(manifest.targets.filter((t) => !ids.has(t.sourceItemId)).map((t) => t.sourceItemId).sort()), "renewal_late_arrivals_invalid");
}

async function verifyObservedTimes(operation: MetricRefreshOperation, entries: readonly MetricEvidenceEntry[], root: string, plannedAt: string, now: Date) {
  for (const entry of entries.filter((e) => e.name.endsWith(".observed.json"))) {
    const evidence = await operation.read<{ observations: readonly { observedAt: string }[] }>(`${root}/${entry.name}`);
    evidenceAssert(evidence && evidence.observations.every((o) => o.observedAt >= plannedAt && o.observedAt <= now.toISOString()), "renewal_observation_time_invalid");
  }
}

export async function readRenewalPredecessor(operation: MetricRefreshOperation, hash: RefreshDigest, now: Date) {
  operation.assertHeld();
  const head = await resolveMetricOperation(operation, hash, now);
  evidenceAssert(head && head.original.operationId === grant.predecessorOperationId && hash(head.original) === grant.predecessorManifestSha &&
    head.original.targets.length === grant.originalCount, "renewal_predecessor_invalid");
  const entries = await operation.entries();
  await verifyObservedTimes(operation, entries, grant.predecessorPath, head.effective.plannedAt, now);
  const final = entries.find((e) => e.name === "final.json");
  evidenceAssert(final, "renewal_predecessor_not_terminal");
  const predecessor: MetricRenewalPredecessor = {
    evidencePath: grant.predecessorPath, operationId: head.original.operationId,
    originalManifestSha: hash(head.original), originalOperationBytesSha: head.originalOperationBytesSha,
    effectiveManifestSha: hash(head.effective), finalBytesSha: final.bytesSha,
    entriesSha: hash([...entries].sort((a, b) => a.name.localeCompare(b.name))),
    originalSourceItemIds: head.original.targets.map((t) => t.sourceItemId).sort(),
  };
  return { predecessor, targets: head.effective.targets };
}
export async function resolveMetricRenewal(operation: MetricRefreshOperation, predecessorOperation: MetricRefreshOperation, hash: RefreshDigest, now: Date) {
  operation.assertHeld(); predecessorOperation.assertHeld();
  const entries = await operation.entries();
  const value = await operation.read<MetricRenewalManifest>(`${grant.evidencePath}/operation.json`);
  if (value === null) { evidenceAssert(entries.every((e) => e.name === "operation.lock"), "renewal_missing_manifest"); return null; }
  assertMetricRenewalManifest(value, hash, now);
  const prior = await readRenewalPredecessor(predecessorOperation, hash, now);
  evidenceAssert(hash(prior.predecessor) === hash(value.predecessor) &&
    hash(orderedMetricTargets(prior.targets)) === hash(value.capture.originalAudit.map((a) => a.priorEffectiveTarget)), "renewal_predecessor_changed");
  await validateExecutedMetricEffects(operation, value, hash(value), entries.filter((e) => !["operation.json", "operation.lock"].includes(e.name)), hash);
  await verifyObservedTimes(operation, entries, grant.evidencePath, value.plannedAt, now);
  return value;
}
