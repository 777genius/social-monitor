import { err, type Clock, type Result } from "@social-monitor/shared-kernel";
import type { SourceEngagementProjectionPort } from "../../ports/source-engagement-projection.port";
import { manifestProblem, targetIdentity } from "./metric-refresh-admission";
import type {
  MetricRefreshManifest, MetricRefreshOutcome, RefreshDigest,
  RetainedMetricFetchCapability, RetainedMetricInventory, RetainedMetricTarget,
} from "./refresh-retained-metrics.contracts";

import type { MetricRefreshOperation, MetricRefreshOperationAuthority } from "./metric-refresh-operation.contracts";
import { resolveMetricOperation } from "./metric-refresh-amendment";

import { ExecuteRetainedMetricBatches } from "./execute-retained-metric-batches";
export class RefreshRetainedMetricsUseCase {
  constructor(
    private readonly inventory: RetainedMetricInventory,
    private readonly fetcher: RetainedMetricFetchCapability,
    private readonly projection: SourceEngagementProjectionPort,
    private readonly receipts: MetricRefreshOperationAuthority,
    private readonly clock: Clock,
    private readonly digest: RefreshDigest,
  ) {}

  async execute(manifest: MetricRefreshManifest, expectedSha = this.digest(manifest)): Promise<Result<readonly MetricRefreshOutcome[], string>> {
    return this.receipts.withOperation((operation) => this.executeLocked(operation, manifest, expectedSha));
  }

  async executeLocked(receipts: MetricRefreshOperation, manifest: MetricRefreshManifest, expectedSha: string): Promise<Result<readonly MetricRefreshOutcome[], string>> {
    receipts.assertHeld();
    const head = await resolveMetricOperation(receipts, this.digest, this.clock.now());
    if (expectedSha !== this.digest(manifest) || (head && this.digest(head.effective) !== expectedSha)) return err("reviewed_manifest_sha_mismatch");
    manifest = head?.effective ?? manifest;
    const problem = manifestProblem(manifest, this.clock.now());
    if (problem) return err(problem);
    const current = await this.inventory.list(manifest.scope, head?.original.targets.map((t) => t.sourceItemId));
    const identities = (targets: readonly RetainedMetricTarget[]) => targets.map(targetIdentity).sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId));
    if (this.digest(identities(current)) !== this.digest(identities(manifest.targets))) return err("inventory_drift");
    const root = manifest.evidencePath;
    if (!head) await receipts.install(`${root}/operation.json`, manifest);
    return new ExecuteRetainedMetricBatches(this.inventory, this.fetcher, this.projection, this.clock, this.digest)
      .execute(receipts, manifest, expectedSha);
  }
}
