import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { refreshBytesHash, refreshOperation, type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { reconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation.spec-support";

export const successorOriginalJobId = "00000000-0000-4000-8000-000000000010";
export const successorReconciliationId = "00000000-0000-4000-8000-000000000011";
export function successorManifest(): RefreshManifest {
  const original = refreshManifest();
  const m = { ...original, successor: {
    format: "reader-summary-new-input-refresh-successor-v1" as const,
    originalJobId: successorOriginalJobId, reconciliationId: successorReconciliationId,
    originalManifestJson: JSON.stringify(original), expiresAt: "2026-09-05T22:25:00.000Z",
  } };
  return { ...m, operation: refreshOperation(m) };
}
export function successorEvidence(m = successorManifest()) {
  const base = reconciliationEvidence();
  return { ...base, date: m.date, jobId: m.successor!.originalJobId,
    operation: JSON.parse(m.successor!.originalManifestJson).operation as string,
    manifestSha256: refreshBytesHash(Buffer.from(m.successor!.originalManifestJson)),
    invocation: { ...base.invocation, purpose: "social_monitor.relevance.assess_source_content.v1", outcome: "failed" } };
}
export function successorJob(m = successorManifest(), id = "00000000-0000-4000-8000-000000000020") {
  return ReaderSummaryJob.request({ id, tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
    scope: { type: "workspace" }, period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC",
      startedAt: new Date(m.startedAt), endedAt: new Date(m.endedAt) }),
    idempotencyKey: m.operation, requestedAt: refreshNow });
}
