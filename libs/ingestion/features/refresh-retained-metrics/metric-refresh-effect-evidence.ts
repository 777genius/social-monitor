import type { MetricRefreshOutcome, PreservedMetricObservation, RefreshDigest } from "./refresh-retained-metrics.contracts";
import type { MetricEvidenceEntry, MetricOperationHead, MetricRefreshOperation } from "./metric-refresh-operation.contracts";
import { refreshBatches } from "./metric-refresh-admission";
import { assertMetricAuthority, evidenceAssert } from "./metric-refresh-evidence-validation";
import { buildSourceEngagementMetrics } from "../../domain";
import { metricRefreshCells } from "./metric-refresh-report";

// Historical effect names are unchanged. Orphan effects never create allowance.
export async function validateMetricEffectReceipts(operation: MetricRefreshOperation, head: MetricOperationHead, entries: readonly MetricEvidenceEntry[], hash: RefreshDigest) {
  const manifest = head.effective, sha = hash(manifest), batches = refreshBatches(manifest.targets);
  const names = new Set(entries.map((entry) => entry.name));
  for (const entry of entries) {
    const value = await operation.read<Record<string, unknown>>(`${manifest.evidencePath}/${entry.name}`);
    evidenceAssert(value !== null && typeof value === "object" && !Array.isArray(value), "malformed_effect_receipt");
    const batch = /^batch-(0|[1-9]\d*)\.(reserved|observed)\.json$/u.exec(entry.name);
    if (batch) {
      const targets = batches[Number(batch[1])];
      evidenceAssert(targets, "orphan_batch_receipt");
      if (batch[2] === "reserved") {
        evidenceAssert(hash(value) === hash({ operationId: manifest.operationId, manifestDigest: sha, targets: targets.map((target) => target.sourceItemId) }), "reservation_head_mismatch");
      } else {
        evidenceAssert(names.has(`batch-${batch[1]}.reserved.json`) && Object.keys(value).sort().join() === "failure,observations" &&
          Array.isArray(value.observations) && value.observations.length <= targets.length && (value.failure === null || typeof value.failure === "string"), "malformed_observation");
        const observations = value.observations as PreservedMetricObservation[];
        evidenceAssert(new Set(observations.map((o) => o?.externalId)).size === observations.length);
        evidenceAssert(value.failure === null ? observations.length === targets.length : observations.length === 0);
        for (const row of observations) {
          evidenceAssert(row && Object.keys(row).sort().join() === "externalId,metadata,observedAt,reason,returned,sample" &&
            targets.some((t) => t.externalId === row.externalId) && typeof row.returned === "boolean" &&
            typeof row.observedAt === "string" && Number.isFinite(Date.parse(row.observedAt)) && new Date(row.observedAt).toISOString() === row.observedAt &&
            (row.reason === null || typeof row.reason === "string") &&
            (row.metadata === null || (typeof row.metadata === "object" && !Array.isArray(row.metadata))) &&
            (row.sample === null || (typeof row.sample === "object" && !Array.isArray(row.sample))), "malformed_observation");
          if (row.sample !== null) {
            const target = targets.find((t) => t.externalId === row.externalId)!;
            const rebuilt = buildSourceEngagementMetrics({ providerKey: target.providerKey, metadata: row.metadata ?? {} });
            evidenceAssert(rebuilt.metrics && rebuilt.qualityFlags.providerKnown && rebuilt.qualityFlags.metadataKindKnown &&
              !rebuilt.qualityFlags.invalidMetricValue && !rebuilt.qualityFlags.conflictingAliases && hash(row.sample) === hash({
                sourceItemId: target.sourceItemId, externalId: target.externalId, publishedAt: target.publishedAt,
                metrics: rebuilt.metrics, metricsFingerprint: rebuilt.metricsFingerprint,
                providerMetadataPatch: rebuilt.providerMetadataPatch, refreshReadModels: true }), "receipt_sample_mismatch");
          }
        }
      }
    } else if (entry.name.startsWith("result-")) {
      const row = value as unknown as MetricRefreshOutcome;
      evidenceAssert(Object.keys(value).sort().join() === ["sourceItemId", "externalId", "providerKey", "date", "status", "returned", "reason", "observedAt", "before", "after",
        ...(value.manifestSha === undefined ? [] : ["manifestSha"])].sort().join(), "invalid_result_schema");
      const target = manifest.targets.find((t) => entry.name === `result-${t.sourceItemId}.json`);
      const index = batches.findIndex((targets) => targets.some((t) => t.sourceItemId === target?.sourceItemId));
      evidenceAssert(target && names.has(`batch-${index}.observed.json`) && row.sourceItemId === target.sourceItemId &&
        row.externalId === target.externalId && row.providerKey === target.providerKey && row.date === target.publishedAt.slice(0, 10) &&
        ["refreshed", "superseded", "unavailable", "failed"].includes(row.status) && typeof row.returned === "boolean" &&
        (row.reason === null || typeof row.reason === "string") &&
        (row.observedAt === null || (typeof row.observedAt === "string" && Number.isFinite(Date.parse(row.observedAt)) && new Date(row.observedAt).toISOString() === row.observedAt)) &&
        hash(row.before) === hash(target.authority) && (row.manifestSha === sha || (head.sequence === 0 && row.manifestSha === undefined)), "invalid_result_receipt");
      assertMetricAuthority(row.after);
    } else if (entry.name === "final.json") {
      evidenceAssert(value.manifestSha === sha && Array.isArray(value.results) && value.results.length === manifest.targets.length && Array.isArray(value.cells), "invalid_final_receipt");
      for (const target of manifest.targets) {
        const row = await operation.read(`${manifest.evidencePath}/result-${target.sourceItemId}.json`);
        evidenceAssert(row !== null && value.results.some((r) => hash(r) === hash(row)), "incomplete_final_receipt");
      }
      evidenceAssert(hash(value) === hash({ manifestSha: sha, results: value.results,
        cells: metricRefreshCells(value.results as MetricRefreshOutcome[], manifest.scope.dates) }), "invalid_final_cells");
    } else evidenceAssert(false, "unknown_metric_evidence");
  }
}
