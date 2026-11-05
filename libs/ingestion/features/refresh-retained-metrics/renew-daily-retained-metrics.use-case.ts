import { err, ok, type Clock, type Result } from "@social-monitor/shared-kernel";
import { retainedMetricDailyGrant } from "../../domain/policies/retained-metric-daily-grant";
import type { SourceEngagementProjectionPort } from "../../ports/source-engagement-projection.port";
import type { MetricImplementation, MetricRefreshOperation, MetricRefreshOperationAuthority } from "./metric-refresh-operation.contracts";
import type { MetricRenewalFailure, MetricRenewalOriginalAudit } from "./metric-renewal.contracts";
import type { MetricRefreshOutcome, RefreshDigest, RetainedMetricFetchCapability, RetainedMetricInventory } from "./refresh-retained-metrics.contracts";
import { renewalOriginalAudit } from "./metric-renewal-evidence";
import { readDailyPredecessors, resolveMetricDaily } from "./metric-daily-evidence";
import { assertMetricDailyManifest } from "./metric-daily-manifest";
import type { MetricDailyManifest } from "./metric-daily.contracts";
import { metricIdentityInventory, orderedMetricTargets } from "./metric-refresh-amendment";
import { ExecuteRetainedMetricBatches } from "./execute-retained-metric-batches";
import { metricRenewalCells } from "./metric-renewal-report";
import { evidenceAssert } from "./metric-refresh-evidence-validation";

export type MetricRenewalFinal = { manifestSha: string; results: readonly MetricRefreshOutcome[]; cells: ReturnType<typeof metricRenewalCells> };
export class RenewDailyRetainedMetricsUseCase {
  constructor(
    private readonly date: string,
    private readonly inventory: RetainedMetricInventory,
    private readonly fetcher: RetainedMetricFetchCapability,
    private readonly projection: SourceEngagementProjectionPort,
    private readonly predecessor: MetricRefreshOperationAuthority,
    private readonly spent: MetricRefreshOperationAuthority,
    private readonly renewal: MetricRefreshOperationAuthority,
    private readonly clock: Clock,
    private readonly digest: RefreshDigest,
  ) {}

  // The caller already holds maintenance locks; the order here cannot vary.
  private async locked<T>(work: (prior: MetricRefreshOperation, spent: MetricRefreshOperation, operation: MetricRefreshOperation) => Promise<T>): Promise<Result<T, MetricRenewalFailure>> {
    try { return ok(await this.predecessor.withOperation((prior) => this.spent.withOperation((spent) => this.renewal.withOperation((operation) => work(prior, spent, operation))))); }
    catch (failure) { return err({ code: "renewal_evidence_invalid", detail: failure instanceof Error ? failure.message : "unknown_failure" }); }
  }

  async prepare(implementation: MetricImplementation): Promise<Result<MetricDailyManifest, MetricRenewalFailure>> {
    let audit: readonly MetricRenewalOriginalAudit[] | undefined;
    const result = await this.locked(async (prior, spent, operation) => {
      const grant = retainedMetricDailyGrant(this.date);
      evidenceAssert(grant, "daily_date_not_reviewed");
      const installed = await resolveMetricDaily(this.date, operation, prior, spent, this.digest, this.clock.now());
      if (installed) {
        evidenceAssert(installed.capture.implementation.sourceSha === implementation.sourceSha &&
          installed.capture.implementation.executableSha === implementation.executableSha, "daily_release_changed");
        return installed;
      }
      const predecessor = await readDailyPredecessors(prior, spent, this.digest, this.clock.now());
      const startedAt = this.clock.now().toISOString();
      const scope = { tenantId: grant.tenantId, workspaceId: grant.workspaceId, dates: grant.dates, endAt: grant.endAt };
      const selectedOriginals = predecessor.targets.filter((t) => t.publishedAt.slice(0, 10) === this.date);
      const selectedIds = selectedOriginals.map((t) => t.sourceItemId);
      const originals = await this.inventory.list(scope, selectedIds);
      const targets = orderedMetricTargets(await this.inventory.list(scope));
      // Exact original rereads cannot disappear through the full-window filter.
      const originalAudit = renewalOriginalAudit(selectedOriginals, originals, this.digest);
      audit = originalAudit;
      evidenceAssert(originals.length === selectedIds.length && originalAudit.every((a) => a.currentTarget !== null &&
        this.digest(metricIdentityInventory([a.currentTarget])) === this.digest(metricIdentityInventory(targets.filter((t) => t.sourceItemId === a.sourceItemId)))), "renewal_original_missing_or_invalid");
      const secondOriginals = await this.inventory.list(scope, selectedIds);
      const secondWindow = await this.inventory.list(scope);
      evidenceAssert(this.digest(metricIdentityInventory(originals)) === this.digest(metricIdentityInventory(secondOriginals)) &&
        this.digest(metricIdentityInventory(targets)) === this.digest(metricIdentityInventory(secondWindow)), "renewal_inventory_drift");
      const completedAt = this.clock.now().toISOString();
      const ids = new Set(predecessor.predecessor.originalSourceItemIds);
      const manifest: MetricDailyManifest = {
        version: grant.version, sourceBase: grant.sourceBase, bounds: grant.bounds, operationId: grant.operationId,
        evidencePath: grant.evidencePath, scope, plannedAt: completedAt, targets, predecessor: predecessor.predecessor, spentRenewal: predecessor.spentRenewal,
        capture: { startedAt, completedAt, inventorySha: this.digest(targets), identityInventorySha: this.digest(metricIdentityInventory(targets)),
          originalAudit: renewalOriginalAudit(selectedOriginals, secondOriginals, this.digest), lateArrivalSourceItemIds: targets.filter((t) => !ids.has(t.sourceItemId)).map((t) => t.sourceItemId).sort(), implementation },
      };
      assertMetricDailyManifest(manifest, this.digest, this.clock.now());
      prior.assertHeld(); spent.assertHeld(); operation.assertHeld();
      await operation.install(`${grant.evidencePath}/operation.json`, manifest);
      return manifest;
    });
    return !result.ok && audit ? err({ ...result.error, originalAudit: audit }) : result;
  }

  async execute(expectedSha: string): Promise<Result<MetricRenewalFinal | readonly MetricRefreshOutcome[], MetricRenewalFailure>> {
    return this.locked(async (prior, spent, operation) => {
      const grant = retainedMetricDailyGrant(this.date);
      evidenceAssert(grant, "daily_date_not_reviewed");
      const manifest = await resolveMetricDaily(this.date, operation, prior, spent, this.digest, this.clock.now());
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
      await resolveMetricDaily(this.date, operation, prior, spent, this.digest, this.clock.now());
      await operation.install(`${grant.evidencePath}/final.json`, result);
      return result;
    });
  }
}
