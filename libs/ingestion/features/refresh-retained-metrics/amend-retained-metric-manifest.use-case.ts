import { err, ok, type Clock, type Result } from "@social-monitor/shared-kernel";
import type { RefreshDigest, RetainedMetricInventory } from "./refresh-retained-metrics.contracts";
import type { MetricImplementation, MetricManifestAmendment, MetricOperationHead, MetricRefreshOperationAuthority } from "./metric-refresh-operation.contracts";
import { applyMetricAmendment, metricEvidencePath, metricIdentityInventory, metricAmendmentName, metricProposalName, orderedMetricTargets, resolveMetricOperation, reviewedContentChanges } from "./metric-refresh-amendment";
import { assertMetricAmendment, assertMetricManifest, evidenceAssert, metricAmendmentLimit, metricProposalLimit, metricSha } from "./metric-refresh-evidence-validation";

export class AmendRetainedMetricManifestUseCase {
  constructor(private readonly inventory: RetainedMetricInventory, private readonly authority: MetricRefreshOperationAuthority,
    private readonly clock: Clock, private readonly hash: RefreshDigest, private readonly implementation: MetricImplementation) {}

  async prepare(expectedPriorSha: string, reason: string): Promise<Result<MetricManifestAmendment, string>> {
    if (!metricSha(expectedPriorSha) || !reason.trim() || reason.length > 1000) return err("invalid_amendment_review");
    return this.authority.withOperation(async (operation) => {
      const head = await resolveMetricOperation(operation, this.hash, this.clock.now(), true);
      if (!head || this.hash(head.effective) !== expectedPriorSha) return err("stale_amendment_head");
      const entries = await operation.entries();
      if (head.sequence >= metricAmendmentLimit || entries.filter((e) => e.name.startsWith("proposal-")).length >= metricProposalLimit) return err("amendment_limit");
      const captureStartedAt = this.clock.now().toISOString();
      const inventory = orderedMetricTargets(await this.inventory.list(head.effective.scope));
      const captureCompletedAt = this.clock.now().toISOString();
      let changes;
      try {
        assertMetricManifest({ ...head.effective, targets: inventory }, this.clock.now());
        changes = reviewedContentChanges(head.effective, inventory, this.hash);
      } catch { return err("inventory_drift"); }
      if (changes.length === 0 || changes.length > 16) return err("content_change_limit");
      const effective = { ...head.effective, targets: head.effective.targets.map((target) => ({ ...target,
        identityDigest: changes.find((change) => change.sourceItemId === target.sourceItemId)?.after ?? target.identityDigest })) };
      const proposal: MetricManifestAmendment = { version: "retained-metrics-amendment.v1", operationId: head.original.operationId, evidencePath: head.original.evidencePath,
        originalManifestSha: this.hash(head.original), originalOperationBytesSha: head.originalOperationBytesSha,
        sequence: head.sequence + 1, previousAmendmentSha: head.amendmentSha, priorEffectiveSha: expectedPriorSha,
        captureStartedAt, captureCompletedAt, reason, implementation: this.implementation, inventory,
        inventorySha: this.hash(inventory), identityInventorySha: this.hash(metricIdentityInventory(inventory)), changes,
        effectiveManifestSha: this.hash(effective), zeroBudgetEvidence: entries, zeroBudgetEvidenceSha: this.hash(entries) };
      applyMetricAmendment(head, proposal, this.hash, this.clock.now());
      evidenceAssert(this.hash(await operation.entries()) === this.hash(entries), "directory_changed_during_capture");
      await operation.install(metricEvidencePath(metricProposalName(this.hash(proposal))), proposal);
      return ok(proposal);
    });
  }

  async commit(reviewedSha: string, expectedPriorSha: string, expectedEffectiveSha: string): Promise<Result<MetricOperationHead, string>> {
    if (![reviewedSha, expectedPriorSha, expectedEffectiveSha].every(metricSha)) return err("invalid_amendment_review");
    return this.authority.withOperation(async (operation) => {
      const head = await resolveMetricOperation(operation, this.hash, this.clock.now(), true);
      const proposal = await operation.read<MetricManifestAmendment>(metricEvidencePath(metricProposalName(reviewedSha)));
      if (!head || !proposal) return err("missing_amendment_review");
      assertMetricAmendment(proposal);
      if (this.hash(proposal) !== reviewedSha || proposal.priorEffectiveSha !== expectedPriorSha || proposal.effectiveManifestSha !== expectedEffectiveSha) return err("reviewed_sha_mismatch");
      if (proposal.implementation.sourceSha !== this.implementation.sourceSha || proposal.implementation.executableSha !== this.implementation.executableSha ||
          proposal.implementation.legacyRetirementRef !== this.implementation.legacyRetirementRef) return err("reviewed_implementation_mismatch");
      if (head.amendmentSha === reviewedSha) return ok(head); // Exact durable replay; never another record or budget.
      if (this.hash(head.effective) !== expectedPriorSha) return err("stale_amendment_head");
      const effective = applyMetricAmendment(head, proposal, this.hash, this.clock.now());
      const current = await this.inventory.list(effective.scope);
      try { assertMetricManifest({ ...effective, targets: current }, this.clock.now()); }
      catch { return err("inventory_drift"); }
      if (this.hash(metricIdentityInventory(current)) !== proposal.identityInventorySha) return err("inventory_drift");
      // Only this proposal may have appeared since its captured zero-budget proof.
      const entries = await operation.entries();
      const before = entries.filter((entry) => entry.name !== metricProposalName(reviewedSha));
      evidenceAssert(this.hash(before) === this.hash(proposal.zeroBudgetEvidence), "zero_budget_evidence_changed");
      await operation.install(metricEvidencePath(metricAmendmentName(proposal.sequence)), proposal);
      return ok({ ...head, effective, sequence: proposal.sequence, amendmentSha: reviewedSha });
    });
  }
}
