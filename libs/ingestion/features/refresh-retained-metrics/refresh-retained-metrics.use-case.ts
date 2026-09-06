import { err, ok, tenantId, workspaceId, type Clock, type Result } from "@social-monitor/shared-kernel";
import { buildSourceEngagementMetrics } from "../../domain";
import type { SourceEngagementProjectionPort } from "../../ports/source-engagement-projection.port";
import { manifestProblem, refreshBatches, sameTarget, targetIdentity, targetProblem } from "./metric-refresh-admission";
import type {
  MetricRefreshManifest, MetricRefreshOutcome, PreservedMetricObservation, RefreshDigest,
  RetainedMetricFetchCapability, RetainedMetricInventory, RetainedMetricTarget,
} from "./refresh-retained-metrics.contracts";

import type { MetricRefreshOperation, MetricRefreshOperationAuthority } from "./metric-refresh-operation.contracts";
import { resolveMetricOperation } from "./metric-refresh-amendment";

type BatchEvidence = { observations: readonly PreservedMetricObservation[]; failure: string | null };
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
    const current = await this.inventory.list(manifest.scope);
    const identities = (targets: readonly RetainedMetricTarget[]) => targets.map(targetIdentity).sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId));
    if (this.digest(identities(current)) !== this.digest(identities(manifest.targets))) return err("inventory_drift");
    const root = manifest.evidencePath;
    if (!head) await receipts.install(`${root}/operation.json`, manifest);
    const results: MetricRefreshOutcome[] = [];
    for (const [index, targets] of refreshBatches(manifest.targets).entries()) {
      const path = `${root}/batch-${index}`;
      const reservation = { operationId: manifest.operationId, manifestDigest: this.digest(manifest), targets: targets.map((t) => t.sourceItemId) };
      if (await receipts.read(`${path}.reserved.json`) === null) {
        // Recheck the entire batch before spending its permanent fetch budget.
        // Existing reservations must still reconcile or replay without a fresh fetch.
        for (const target of targets) {
          const latest = await this.inventory.read(manifest.scope, target.sourceItemId);
          if (!sameTarget(target, latest, this.digest) || latest === null || targetProblem(latest, manifest.scope)) return err("target_drift");
        }
      }
      const reserved = await receipts.install(`${path}.reserved.json`, reservation);
      let evidence = await receipts.read<BatchEvidence>(`${path}.observed.json`);
      if (evidence === null && reserved === "installed") {
        // No provider work precedes the permanent batch reservation. No retry on resume.
        receipts.assertHeld();
        const fetched = await this.fetcher.fetch(targets);
        const observedAt = this.clock.now().toISOString();
        if (!fetched.ok) evidence = { observations: [], failure: fetched.error };
        else {
          const ids = fetched.value.map((row) => row.externalId);
          if (new Set(ids).size !== ids.length || ids.some((id) => !targets.some((t) => t.externalId === id))) {
            evidence = { observations: [], failure: "provider_identity_mismatch" };
          } else {
            evidence = { failure: null, observations: targets.map((target) => {
              const returned = fetched.value.find((row) => row.externalId === target.externalId);
              const metadata = returned?.metadata ?? null;
              const built = metadata === null ? null : buildSourceEngagementMetrics({ providerKey: target.providerKey, metadata });
              const valid = built?.metrics && built.metricsFingerprint && built.qualityFlags.providerKnown && built.qualityFlags.metadataKindKnown &&
                !built.qualityFlags.invalidMetricValue && !built.qualityFlags.conflictingAliases;
              return { externalId: target.externalId, returned: returned?.returned ?? false, observedAt, metadata,
                reason: returned?.reason ?? (metadata === null ? "omitted" : valid ? null : "invalid_metrics"),
                sample: valid ? { sourceItemId: target.sourceItemId, externalId: target.externalId,
                  publishedAt: target.publishedAt, metrics: built.metrics!, metricsFingerprint: built.metricsFingerprint!,
                  providerMetadataPatch: built.providerMetadataPatch, refreshReadModels: true } : null };
            }) };
          }
        }
        // Persist the normalized provider observation AND exact canonical sample before projection.
        await receipts.install(`${path}.observed.json`, evidence);
      }
      if (evidence === null) {
        const remaining = manifest.targets.filter((target) => !results.some((row) => row.sourceItemId === target.sourceItemId));
        return ok([...results, ...remaining.map((target): MetricRefreshOutcome => ({
          manifestSha: expectedSha, sourceItemId: target.sourceItemId, externalId: target.externalId, providerKey: target.providerKey,
          date: target.publishedAt.slice(0, 10), status: "uncertain", returned: false,
          reason: "reserved_without_observation_reconcile_required", observedAt: null,
          before: target.authority, after: target.authority,
        }))]);
      }
      for (const target of targets) {
        const resultPath = `${root}/result-${target.sourceItemId}.json`;
        const previous = await receipts.read<MetricRefreshOutcome>(resultPath);
        if (previous !== null) { results.push(previous); continue; }
        const observation = evidence.observations.find((row) => row.externalId === target.externalId);
        const latest = await this.inventory.read(manifest.scope, target.sourceItemId);
        if (!sameTarget(target, latest, this.digest) || latest === null || targetProblem(latest, manifest.scope)) return err("target_drift");
        let result: MetricRefreshOutcome = {
          manifestSha: expectedSha, sourceItemId: target.sourceItemId, externalId: target.externalId, providerKey: target.providerKey,
          date: target.publishedAt.slice(0, 10), before: target.authority, after: latest.authority,
          returned: observation?.returned ?? false,
          observedAt: observation?.observedAt ?? null, status: observation?.reason === "invalid_metrics" ? "failed" : "unavailable", reason: observation?.reason ?? null,
        };
        if (evidence.failure !== null) result = { ...result, status: "failed", reason: evidence.failure };
        else if (observation === undefined) return err("receipt_observation_missing");
        else if (observation.sample !== null) {
          const rebuilt = buildSourceEngagementMetrics({ providerKey: target.providerKey, metadata: observation.metadata ?? {} });
          const expectedSample = { sourceItemId: target.sourceItemId, externalId: target.externalId,
            publishedAt: target.publishedAt, metrics: rebuilt.metrics, metricsFingerprint: rebuilt.metricsFingerprint,
            providerMetadataPatch: rebuilt.providerMetadataPatch, refreshReadModels: true };
          if (!rebuilt.metrics || rebuilt.qualityFlags.invalidMetricValue || rebuilt.qualityFlags.conflictingAliases ||
              this.digest(expectedSample) !== this.digest(observation.sample)) return err("receipt_sample_mismatch");
          const now = this.clock.now();
          if (!Number.isFinite(Date.parse(observation.observedAt)) || new Date(observation.observedAt).toISOString() !== observation.observedAt || Date.parse(observation.observedAt) > now.getTime() || Date.parse(observation.observedAt) < Date.parse(manifest.plannedAt)) return err("receipt_observation_time_invalid");
          try {
            // Replaying these same bytes is safe, including a lost commit acknowledgement.
            receipts.assertHeld();
            await this.projection.project({ tenantId: tenantId(manifest.scope.tenantId), workspaceId: workspaceId(manifest.scope.workspaceId),
              sourceBindingId: target.sourceBindingId, scanJobId: manifest.operationId,
              providerKey: target.providerKey, observedAt: new Date(observation.observedAt),
              samples: [{ ...observation.sample, publishedAt: new Date(observation.sample.publishedAt) }] });
            const after = (await this.inventory.read(manifest.scope, target.sourceItemId))?.authority;
            if (!after?.observedAt || after.observedAt < observation.observedAt ||
                (after.observedAt === observation.observedAt && after.metricsHash !== observation.sample.metricsFingerprint)) return err("projection_not_confirmed");
            result = { ...result, after, status: after.observedAt > observation.observedAt ? "superseded" : "refreshed" };
          } catch {
            // No terminal receipt for an uncertain projection; resume uses the preserved sample.
            results.push({ ...result, status: "failed", reason: "projection_unacknowledged_resume_same_operation" });
            continue;
          }
        }
        if (result.status !== "uncertain") await receipts.install(resultPath, result);
        results.push(result);
      }
    }
    return ok(results);
  }
}
