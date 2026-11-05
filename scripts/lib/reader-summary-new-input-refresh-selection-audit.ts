import { PROMOTION_ELIGIBLE_ITEM_CEILING, PROMOTION_PHYSICAL_ROW_CEILING } from "@social-monitor/feed/ports";
import { READER_SUMMARY_EDITORIAL_SLATE_VERSION, type SummaryEvidenceSelection } from "@social-monitor/summary/domain";
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
  record(event: unknown): void | Promise<void>; invalidate(): void;
}): ReaderSummaryEvidenceSelectorPort {
  return { select: async (query) => {
    const selection = await input.selector.select(query);
    try { await input.record(selectionReceipt(input.manifest, input.jobId, selection)); }
    catch (error) { input.invalidate(); throw error; }
    return selection;
  } };
}

function selectionReceipt(m: RefreshManifest, jobId: string, selection: SummaryEvidenceSelection) {
  const slate = selection.editorialSlate;
  const selectedEvidence = auditArray(selection.selectedEvidence), clusters = auditArray(selection.clusters);
  const top = slate === undefined ? [] : auditArray(slate.top);
  const additional = slate === undefined ? [] : auditArray(slate.additional);
  const excluded = slate === undefined ? [] : auditArray(slate.excluded);
  if (slate !== undefined && slate.policyVersion !== READER_SUMMARY_EDITORIAL_SLATE_VERSION) {
    throw new Error("Refresh selection audit requires the canonical policy version");
  }
  const candidateCount = top.length + additional.length + excluded.length;
  const supportCount = clusters.reduce((sum, cluster) => sum + auditArray(cluster.duplicateFeedItemIds).length, 0);
  if (candidateCount > PROMOTION_ELIGIBLE_ITEM_CEILING || candidateCount > m.authority.eligibleCount ||
      selectedEvidence.length > PROMOTION_PHYSICAL_ROW_CEILING ||
      clusters.length > PROMOTION_PHYSICAL_ROW_CEILING || supportCount > PROMOTION_PHYSICAL_ROW_CEILING) {
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
    selectedFeedItemIds: Object.freeze(Array.from(selectedEvidence, (item) => auditId(item.feedItemId))),
    support: Object.freeze(Array.from(clusters, (cluster) => Object.freeze({
      representativeFeedItemId: auditId(cluster.representativeFeedItemId),
      supportFeedItemIds: Object.freeze(Array.from(auditArray(cluster.duplicateFeedItemIds), auditId)),
    }))),
    // Absent is distinct from an authoritative empty/no-signal slate.
    editorialSlate: slate === undefined ? null : Object.freeze({
      policyVersion: READER_SUMMARY_EDITORIAL_SLATE_VERSION,
      topCandidateIds: Object.freeze(Array.from(top, (entry) => auditId(entry.candidateId))),
      additionalCandidateIds: Object.freeze(Array.from(additional, (entry) => auditId(entry.candidateId))),
      excluded: Object.freeze(Array.from(excluded, (item) => Object.freeze({
        candidateId: auditId(item.candidateId), reasonCodes: auditReasons(item.reasonCodes),
      }))),
    }),
  });
}

function auditArray<T>(value: readonly T[]): readonly T[] {
  if (!Array.isArray(value)) throw new Error("Refresh selection audit requires actual arrays");
  return value;
}

function auditId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Refresh selection audit requires primitive string IDs");
  return value;
}

function auditReasons(value: readonly string[]): readonly string[] {
  const codes = auditArray(value);
  if (codes.length > exclusionCodes.size) {
    throw new Error("Refresh selection audit exceeds canonical bounds or reason vocabulary");
  }
  return Object.freeze(Array.from(codes, (code) => {
    if (typeof code !== "string" || !exclusionCodes.has(code)) {
      throw new Error("Refresh selection audit exceeds canonical bounds or reason vocabulary");
    }
    return code;
  }));
}
