import { PROMOTION_ELIGIBLE_ITEM_CEILING, PROMOTION_PHYSICAL_ROW_CEILING } from "@social-monitor/feed/ports";
import type { SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import { refreshHash, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

// Diagnostic vocabulary only: unknown codes fail closed instead of admitting prose.
const exclusionCodes = new Set([
  "identity_missing", "publication_time_malformed", "score_malformed", "content_kind_not_admitted",
  "relevance_floor_not_met", "quality_floor_not_met", "integrity_floor_not_met", "safety_floor_not_met",
  "freshness_floor_not_met", "engagement_missing", "engagement_malformed", "engagement_conflict",
  "engagement_unauthoritative", "engagement_authority_missing", "engagement_authority_malformed",
  "engagement_observed_after_cutoff", "engagement_stale", "engagement_regression_unresolved",
  "provider_floor_not_met", "semantic_story_duplicate", "editorial_capacity_exhausted",
]);

/** Wrap the already guarded selector, so both snapshot checks precede recording.
 * This is the actual selection decision, not a later reconstruction or publication proof. */
export function withRefreshSelectionAudit(input: {
  selector: ReaderSummaryEvidenceSelectorPort; manifest: RefreshManifest; jobId: string;
  record(event: unknown): void; invalidate(): void;
}): ReaderSummaryEvidenceSelectorPort {
  return { select: async (query) => {
    const selection = await input.selector.select(query);
    try { input.record(selectionReceipt(input.manifest, input.jobId, selection)); }
    catch (error) { input.invalidate(); throw error; }
    return selection;
  } };
}

function selectionReceipt(m: RefreshManifest, jobId: string, selection: SummaryEvidenceSelection) {
  const slate = selection.editorialSlate;
  const excluded = slate?.excluded ?? [];
  const candidateCount = (slate?.top.length ?? 0) + (slate?.additional.length ?? 0) + excluded.length;
  const supportCount = selection.clusters.reduce((sum, cluster) => sum + cluster.duplicateFeedItemIds.length, 0);
  if (candidateCount > PROMOTION_ELIGIBLE_ITEM_CEILING || candidateCount > m.authority.eligibleCount ||
      selection.selectedEvidence.length > PROMOTION_PHYSICAL_ROW_CEILING ||
      selection.clusters.length > PROMOTION_PHYSICAL_ROW_CEILING || supportCount > PROMOTION_PHYSICAL_ROW_CEILING ||
      excluded.some((item) => item.reasonCodes.length > exclusionCodes.size ||
        item.reasonCodes.some((code) => !exclusionCodes.has(code)))) {
    throw new Error("Refresh selection audit exceeds canonical bounds or reason vocabulary");
  }
  return Object.freeze({
    status: "selection_audit", format: "reader-summary-refresh-selection-v1",
    tenantId: m.tenantId, workspaceId: m.workspaceId, scope: "workspace", date: m.date,
    startedAt: m.startedAt, endedAt: m.endedAt, timezone: m.timezone,
    jobId, operation: m.operation, observedThrough: m.observedThrough,
    priorArtifactId: m.prior.artifactId, priorObservedThrough: m.prior.observedThrough,
    // Canonical object hash; the CLI's terminal receipt binds the reviewed file-byte hash via operation.
    manifestCanonicalSha256: refreshHash(m), sourceSha256: m.sourceSha256,
    generationSha256: m.generationSha256, canonicalInputSha256: m.authority.canonicalInputSha256,
    canonicalCandidateCount: m.authority.eligibleCount,
    selectedFeedItemIds: Object.freeze(selection.selectedEvidence.map((item) => item.feedItemId)),
    support: Object.freeze(selection.clusters.map((cluster) => Object.freeze({
      representativeFeedItemId: cluster.representativeFeedItemId,
      supportFeedItemIds: Object.freeze([...cluster.duplicateFeedItemIds]),
    }))),
    // Absent is distinct from an authoritative empty/no-signal slate.
    editorialSlate: slate === undefined ? null : Object.freeze({
      policyVersion: slate.policyVersion,
      topCandidateIds: Object.freeze(slate.top.map((entry) => entry.candidateId)),
      additionalCandidateIds: Object.freeze(slate.additional.map((entry) => entry.candidateId)),
      excluded: Object.freeze(excluded.map((item) => Object.freeze({
        candidateId: item.candidateId, reasonCodes: Object.freeze([...item.reasonCodes]),
      }))),
    }),
  });
}
