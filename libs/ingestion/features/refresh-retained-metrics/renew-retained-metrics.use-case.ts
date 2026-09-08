import { err, ok, type Clock, type Result } from "@social-monitor/shared-kernel";
import { retainedMetricRenewalGrant as grant } from "../../domain/policies/retained-metric-renewal-grant";
import type { SourceEngagementProjectionPort } from "../../ports/source-engagement-projection.port";
import type { MetricImplementation, MetricRefreshOperation, MetricRefreshOperationAuthority } from "./metric-refresh-operation.contracts";
import type { MetricRenewalFailure, MetricRenewalManifest, MetricRenewalOriginalAudit } from "./metric-renewal.contracts";
import type { MetricRefreshOutcome, RefreshDigest, RetainedMetricFetchCapability, RetainedMetricInventory } from "./refresh-retained-metrics.contracts";
import { assertMetricRenewalManifest, readRenewalPredecessor, renewalOriginalAudit, resolveMetricRenewal } from "./metric-renewal-evidence";
import { metricIdentityInventory, orderedMetricTargets } from "./metric-refresh-amendment";
import { ExecuteRetainedMetricBatches } from "./execute-retained-metric-batches";
import { metricRenewalCells } from "./metric-renewal-report";
import { evidenceAssert } from "./metric-refresh-evidence-validation";

export type MetricRenewalFinal = { manifestSha: string; results: readonly MetricRefreshOutcome[]; cells: ReturnType<typeof metricRenewalCells> };
export class RenewRetainedMetricsUseCase {
  constructor(
    private readonly inventory: RetainedMetricInventory,
    private readonly fetcher: RetainedMetricFetchCapability,
    private readonly projection: SourceEngagementProjectionPort,
    private readonly predecessor: MetricRefreshOperationAuthority,
    private readonly renewal: MetricRefreshOperationAuthority,
    private readonly clock: Clock,
    private readonly digest: RefreshDigest,
  ) {}

  // The caller already holds maintenance locks; the order here cannot vary.
  private async locked<T>(work: (prior: MetricRefreshOperation, operation: MetricRefreshOperation) => Promise<T>): Promise<Result<T, MetricRenewalFailure>> {
    try { return ok(await this.predecessor.withOperation((prior) => this.renewal.withOperation((operation) => work(prior, operation)))); }
    catch (failure) { return err({ code: "renewal_evidence_invalid", detail: failure instanceof Error ? failure.message : "unknown_failure" }); }
  }

  async prepare(implementation: MetricImplementation): Promise<Result<MetricRenewalManifest, MetricRenewalFailure>> {
    let audit: readonly MetricRenewalOriginalAudit[] | undefined;
    const result = await this.locked(async (prior, operation) => {
      const installed = await resolveMetricRenewal(operation, prior, this.digest, this.clock.now());
      if (installed) return installed;
      const predecessor = await readRenewalPredecessor(prior, this.digest, this.clock.now());
      const startedAt = this.clock.now().toISOString();
      const scope = { tenantId: grant.tenantId, workspaceId: grant.workspaceId, dates: grant.dates, endAt: grant.endAt };
      const originals = await this.inventory.list(scope, predecessor.predecessor.originalSourceItemIds);
      const targets = orderedMetricTargets(await this.inventory.list(scope));
      // Exact original rereads cannot disappear through the full-window filter.
      const originalAudit = renewalOriginalAudit(predecessor.targets, originals, this.digest);
      audit = originalAudit;
      evidenceAssert(originals.length === grant.originalCount && originalAudit.every((a) => a.currentTarget !== null &&
        this.digest(metricIdentityInventory([a.currentTarget])) === this.digest(metricIdentityInventory(targets.filter((t) => t.sourceItemId === a.sourceItemId)))), "renewal_original_missing_or_invalid");
      const secondOriginals = await this.inventory.list(scope, predecessor.predecessor.originalSourceItemIds);
      const secondWindow = await this.inventory.list(scope);
      evidenceAssert(this.digest(metricIdentityInventory(originals)) === this.digest(metricIdentityInventory(secondOriginals)) &&
        this.digest(metricIdentityInventory(targets)) === this.digest(metricIdentityInventory(secondWindow)), "renewal_inventory_drift");
      const completedAt = this.clock.now().toISOString();
      const ids = new Set(predecessor.predecessor.originalSourceItemIds);
      const manifest: MetricRenewalManifest = {
        version: grant.version, sourceBase: grant.sourceBase, bounds: grant.bounds, operationId: grant.operationId,
        evidencePath: grant.evidencePath, scope, plannedAt: completedAt, targets, predecessor: predecessor.predecessor,
        capture: { startedAt, completedAt, inventorySha: this.digest(targets), identityInventorySha: this.digest(metricIdentityInventory(targets)),
          originalAudit: renewalOriginalAudit(predecessor.targets, secondOriginals, this.digest), lateArrivalSourceItemIds: targets.filter((t) => !ids.has(t.sourceItemId)).map((t) => t.sourceItemId).sort(), implementation },
      };
      assertMetricRenewalManifest(manifest, this.digest, this.clock.now());
      prior.assertHeld(); operation.assertHeld();
      await operation.install(`${grant.evidencePath}/operation.json`, manifest);
      return manifest;
    });
    return !result.ok && audit ? err({ ...result.error, originalAudit: audit }) : result;
  }

  async execute(expectedSha: string): Promise<Result<MetricRenewalFinal | readonly MetricRefreshOutcome[], MetricRenewalFailure>> {
    return this.locked(async (prior, operation) => {
      const manifest = await resolveMetricRenewal(operation, prior, this.digest, this.clock.now());
      evidenceAssert(manifest && this.digest(manifest) === expectedSha, "reviewed_manifest_sha_mismatch");
      const final = await operation.read<MetricRenewalFinal>(`${grant.evidencePath}/final.json`);
      if (final !== null) return final;
      const current = await this.inventory.list(manifest.scope, manifest.targets.map((t) => t.sourceItemId));
      evidenceAssert(this.digest(metricIdentityInventory(current)) === manifest.capture.identityInventorySha, "renewal_inventory_drift");
      const executed = await new ExecuteRetainedMetricBatches(this.inventory, this.fetcher, this.projection, this.clock, this.digest)
        .execute(operation, manifest, expectedSha);
      evidenceAssert(executed.ok, executed.ok ? undefined : executed.error);
      const result = { manifestSha: expectedSha, results: executed.value, cells: metricRenewalCells(executed.value, manifest.scope.dates) };
      for (const target of manifest.targets) {
        if (await operation.read(`${grant.evidencePath}/result-${target.sourceItemId}.json`) === null) return executed.value;
      }
      // Validate every observation/result binding before granting terminal replay.
      await resolveMetricRenewal(operation, prior, this.digest, this.clock.now());
      await operation.install(`${grant.evidencePath}/final.json`, result);
      return result;
    });
  }
}
