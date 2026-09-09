import { retainedMetricDailyPredecessorPins as pins, retainedMetricDailyGrant } from "../../domain/policies/retained-metric-daily-grant";
import { retainedMetricRenewalGrant as spentGrant } from "../../domain/policies/retained-metric-renewal-grant";
import type { MetricRefreshOperation, MetricEvidenceEntry } from "./metric-refresh-operation.contracts";
import type { RefreshDigest } from "./refresh-retained-metrics.contracts";
import type { MetricDailyManifest } from "./metric-daily.contracts";
import type { MetricRenewalFinal } from "./renew-retained-metrics.use-case";
import { resolveMetricRenewal } from "./metric-renewal-evidence";
import { assertMetricDailyManifest } from "./metric-daily-manifest";
import { evidenceAssert } from "./metric-refresh-evidence-validation";
import { validateExecutedMetricEffects } from "./metric-refresh-effect-evidence";
import { metricRenewalCells } from "./metric-renewal-report";

// Match the supplied entryListSha encoding, including the empty operation.lock.
export function dailyPredecessorEntryList(entries: readonly MetricEvidenceEntry[]) {
  return [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map((entry) => ({ name: entry.name, sha256: entry.bytesSha }));
}
function assertPins(entries: readonly MetricEvidenceEntry[], pin: typeof pins[keyof typeof pins], hash: RefreshDigest) {
  evidenceAssert(entries.find((e) => e.name === "operation.json")?.bytesSha === pin.operationBytesSha256 &&
    entries.find((e) => e.name === "final.json")?.bytesSha === pin.finalBytesSha256 &&
    hash(dailyPredecessorEntryList(entries)) === pin.entryListSha256, "daily_predecessor_bytes_changed");
}
export async function readDailyPredecessors(prior: MetricRefreshOperation, spent: MetricRefreshOperation, hash: RefreshDigest, now: Date) {
  // The fixed resolver validates the complete original chain and binds every
  // priorEffectiveTarget. Reuse that admitted lineage rather than re-resolving it.
  const renewal = await resolveMetricRenewal(spent, prior, hash, now);
  evidenceAssert(renewal && hash(renewal) === pins["retained-metrics-renewal-20260908"].operationEnvelopeDigest,
    "daily_spent_manifest_invalid");
  const originalEntries = await prior.entries(), spentEntries = await spent.entries();
  assertPins(originalEntries, pins["retained-metrics-v1"], hash);
  assertPins(spentEntries, pins["retained-metrics-renewal-20260908"], hash);
  evidenceAssert(await spent.read(`${spentGrant.evidencePath}/final.json`), "daily_spent_not_terminal");
  const spentRenewal = { manifestSha: hash(renewal), operationBytesSha: pins["retained-metrics-renewal-20260908"].operationBytesSha256,
    finalBytesSha: pins["retained-metrics-renewal-20260908"].finalBytesSha256,
    entryListSha: hash(dailyPredecessorEntryList(spentEntries)) };
  return { predecessor: renewal.predecessor, targets: renewal.capture.originalAudit.map((a) => a.priorEffectiveTarget), spentRenewal };
}
export async function resolveMetricDaily(date: string, operation: MetricRefreshOperation, prior: MetricRefreshOperation,
  spent: MetricRefreshOperation, hash: RefreshDigest, now: Date) {
  const grant = retainedMetricDailyGrant(date);
  evidenceAssert(grant, "daily_date_not_reviewed");
  operation.assertHeld(); prior.assertHeld(); spent.assertHeld();
  // Validate the complete immutable lineage even before installing a new day.
  const lineage = await readDailyPredecessors(prior, spent, hash, now);
  const entries = await operation.entries();
  const value = await operation.read<MetricDailyManifest>(`${grant.evidencePath}/operation.json`);
  if (!value) { evidenceAssert(entries.every((e) => e.name === "operation.lock"), "daily_missing_manifest"); return null; }
  assertMetricDailyManifest(value, hash, now);
  evidenceAssert(value.evidencePath === grant.evidencePath && hash(value.predecessor) === hash(lineage.predecessor) &&
    hash(value.spentRenewal) === hash(lineage.spentRenewal), "daily_lineage_changed");
  const originals = lineage.targets.filter((t) => t.publishedAt.slice(0, 10) === date).sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId));
  evidenceAssert(hash(originals) === hash(value.capture.originalAudit.map((a) => a.priorEffectiveTarget)), "daily_original_membership_changed");
  await validateExecutedMetricEffects(operation, value, hash(value), entries.filter((e) => !["operation.json", "operation.lock", "final.json"].includes(e.name)), hash);
  for (const entry of entries.filter((e) => e.name.endsWith(".observed.json"))) {
    const observed = await operation.read<{ observations: readonly { observedAt: string }[] }>(`${grant.evidencePath}/${entry.name}`);
    evidenceAssert(observed && observed.observations.every((o) => o.observedAt >= value.plannedAt && o.observedAt <= now.toISOString()), "daily_observation_time_invalid");
  }
  const final = await operation.read<MetricRenewalFinal>(`${grant.evidencePath}/final.json`);
  if (final) {
    evidenceAssert(Array.isArray(final.results) && final.results.length === value.targets.length, "daily_final_incomplete");
    const hashes = new Set(final.results.map((r) => hash(r)));
    for (const target of value.targets) {
      const result = await operation.read(`${grant.evidencePath}/result-${target.sourceItemId}.json`);
      evidenceAssert(result && hashes.has(hash(result)), "daily_final_membership_invalid");
    }
    evidenceAssert(hash(final) === hash({ manifestSha: hash(value), results: final.results,
      cells: metricRenewalCells(final.results, value.scope.dates) }), "daily_final_invalid");
  }
  return value;
}
