import type { MetricRefreshManifest, RefreshDigest, RetainedMetricTarget } from "./refresh-retained-metrics.contracts";
import type { MetricContentChange, MetricManifestAmendment, MetricOperationHead, MetricRefreshOperation } from "./metric-refresh-operation.contracts";
import { metricRefreshEvidencePath, targetIdentity } from "./metric-refresh-admission";
import { assertMetricAmendment, assertMetricManifest, evidenceAssert, metricAmendmentLimit, metricProposalLimit } from "./metric-refresh-evidence-validation";
import { validateMetricEffectReceipts } from "./metric-refresh-effect-evidence";

export const orderedMetricTargets = (targets: readonly RetainedMetricTarget[]) => [...targets].sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId));
export const metricIdentityInventory = (targets: readonly RetainedMetricTarget[]) => orderedMetricTargets(targets).map(targetIdentity);
export const metricAmendmentName = (sequence: number) => `amendment-${String(sequence).padStart(6, "0")}.json`;
export const metricProposalName = (sha: string) => `proposal-${sha}.json`;
export const metricEvidencePath = (name: string) => `${metricRefreshEvidencePath}/${name}`;

export function reviewedContentChanges(prior: MetricRefreshManifest, current: readonly RetainedMetricTarget[], hash: RefreshDigest): MetricContentChange[] {
  const ordered = orderedMetricTargets(current);
  const previous = orderedMetricTargets(prior.targets);
  evidenceAssert(ordered.length === previous.length, "inventory_membership_drift");
  const changes: MetricContentChange[] = [];
  for (const [i, row] of ordered.entries()) {
    const before = previous[i]!;
    evidenceAssert(hash({ ...targetIdentity(row), identityDigest: before.identityDigest }) === hash(targetIdentity(before)), "non_content_inventory_drift");
    if (row.identityDigest !== before.identityDigest) changes.push({ sourceItemId: row.sourceItemId, before: before.identityDigest, after: row.identityDigest });
  }
  return changes;
}
export function applyMetricAmendment(head: MetricOperationHead, amendment: MetricManifestAmendment, hash: RefreshDigest, now: Date): MetricRefreshManifest {
  assertMetricAmendment(amendment);
  evidenceAssert(amendment.operationId === head.original.operationId && amendment.evidencePath === head.original.evidencePath &&
    amendment.originalManifestSha === hash(head.original) && amendment.originalOperationBytesSha === head.originalOperationBytesSha &&
    amendment.sequence === head.sequence + 1 && amendment.previousAmendmentSha === head.amendmentSha && amendment.priorEffectiveSha === hash(head.effective), "stale_amendment_head");
  evidenceAssert(amendment.captureStartedAt >= head.original.plannedAt && amendment.captureCompletedAt <= now.toISOString(), "invalid_capture_time");
  assertMetricManifest({ ...head.effective, targets: amendment.inventory }, now);
  const changes = reviewedContentChanges(head.effective, amendment.inventory, hash);
  evidenceAssert(hash(changes) === hash(amendment.changes) && changes.length > 0 && changes.length <= 16, "unreviewed_content_diff");
  evidenceAssert(hash(orderedMetricTargets(amendment.inventory)) === amendment.inventorySha &&
    hash(metricIdentityInventory(amendment.inventory)) === amendment.identityInventorySha, "invalid_inventory_sha");
  const evidence = amendment.zeroBudgetEvidence;
  evidenceAssert(hash(evidence) === amendment.zeroBudgetEvidenceSha, "invalid_zero_budget_sha");
  evidenceAssert(hash([...evidence].sort((a, b) => a.name.localeCompare(b.name))) === hash(evidence) && new Set(evidence.map((e) => e.name)).size === evidence.length &&
    evidence.some((e) => e.name === "operation.json" && e.bytesSha === head.originalOperationBytesSha) && evidence.some((e) => e.name === "operation.lock"), "invalid_zero_budget_evidence");
  const replacements = new Map(changes.map((change) => [change.sourceItemId, change.after]));
  const effective = { ...head.effective, targets: head.effective.targets.map((target) => ({ ...target, identityDigest: replacements.get(target.sourceItemId) ?? target.identityDigest })) };
  assertMetricManifest(effective, now);
  evidenceAssert(hash(effective) === amendment.effectiveManifestSha, "effective_sha_mismatch");
  return effective;
}

export async function resolveMetricOperation(operation: MetricRefreshOperation, hash: RefreshDigest, now: Date, zeroBudget = false): Promise<MetricOperationHead | null> {
  operation.assertHeld();
  const entries = await operation.entries();
  const proposals = entries.filter((entry) => entry.name.startsWith("proposal-"));
  const amendments = entries.filter((entry) => entry.name.startsWith("amendment-"));
  evidenceAssert(proposals.length <= metricProposalLimit && amendments.length <= metricAmendmentLimit, "amendment_limit");
  const original = await operation.read<MetricRefreshManifest>(metricEvidencePath("operation.json"));
  if (original === null) { evidenceAssert(entries.every((e) => e.name === "operation.lock"), "missing_original"); return null; }
  assertMetricManifest(original, now);
  let head: MetricOperationHead = { original, effective: original, originalOperationBytesSha: entries.find((entry) => entry.name === "operation.json")!.bytesSha, sequence: 0, amendmentSha: null };
  const heads = [head];
  for (const entry of amendments) {
    evidenceAssert(entry.name === metricAmendmentName(head.sequence + 1), "amendment_gap_or_fork");
    const amendment = await operation.read<MetricManifestAmendment>(metricEvidencePath(entry.name));
    assertMetricAmendment(amendment);
    const effective = applyMetricAmendment(head, amendment, hash, now);
    evidenceAssert(proposals.some((p) => p.name === metricProposalName(hash(amendment))), "missing_reviewed_proposal");
    head = { ...head, effective, sequence: amendment.sequence, amendmentSha: hash(amendment) };
    heads.push(head);
  }
  for (const entry of proposals) {
    const proposal = await operation.read<MetricManifestAmendment>(metricEvidencePath(entry.name));
    assertMetricAmendment(proposal);
    evidenceAssert(entry.name === metricProposalName(hash(proposal)) && proposal.originalManifestSha === hash(original) &&
      proposal.originalOperationBytesSha === head.originalOperationBytesSha && proposal.operationId === original.operationId && proposal.evidencePath === original.evidencePath, "invalid_proposal");
    const parent = heads[proposal.sequence - 1];
    evidenceAssert(parent, "missing_proposal_parent");
    applyMetricAmendment(parent, proposal, hash, now);
    for (const recorded of proposal.zeroBudgetEvidence) {
      evidenceAssert(entries.some((current) => current.name === recorded.name && current.bytesSha === recorded.bytesSha), "changed_zero_budget_evidence");
    }
  }
  const effects = entries.filter((entry) => !["operation.json", "operation.lock"].includes(entry.name) && !proposals.includes(entry) && !amendments.includes(entry));
  evidenceAssert(!zeroBudget || effects.length === 0, "metric_budget_already_started");
  await validateMetricEffectReceipts(operation, head, effects, hash);
  return head;
}
