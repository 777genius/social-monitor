import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshBytesHash, refreshHash } from "./reader-summary-new-input-refresh-manifest";
import { reconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";
import type { RefreshCurrentAuthorityReconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation";

type Row = { at: string; event: Record<string, unknown> };
export function currentAuthorityFixture(change?: (rows: Row[]) => void) {
  const root = mkdtempSync(join(tmpdir(), "refresh-current-authority-spec-"));
  const manifest = refreshManifest();
  const base = { ...reconciliationEvidence(), date: manifest.date, operation: manifest.operation };
  const observedThrough = manifest.observedThrough;
  const save = (name: string, text: string) => {
    const path = join(root, name);
    writeFileSync(path, text, { mode: 0o600 }); chmodSync(path, 0o400);
    return { path, hash: refreshBytesHash(Buffer.from(text)) };
  };
  const manifestFile = save("manifest.json", JSON.stringify(manifest) + "\n");
  const row = (status: string, fields: Record<string, unknown> = {}): Row => ({
    at: manifest.preparedAt, event: { status, operation: base.operation, ...fields } });
  const failures = Array.from({ length: 6 }, (_, index) => row("requires_reconciliation", {
    requestId: `synthetic-${index}`, purpose: "social_monitor.relevance.assess_source_content.v1",
    requestSha256: refreshHash({ index }), observedThrough, model: "gpt-5.6-sol", reasoningEffort: "low",
    delegated: false, preDelegationFailureStage: "current_authority",
  }));
  const attempts = failures.map((failure) => ({
    requestId: String(failure.event.requestId), purpose: String(failure.event.purpose),
    requestSha256: String(failure.event.requestSha256), attemptSha256: refreshHash(failure),
    failedAt: failure.at, delegated: false as const, preDelegationFailureStage: "current_authority" as const,
  }));
  const rows = [row("before", { observedThrough, prior: manifest.prior, countsBefore: { jobs: 1, publications: 1, outbox: 1, artifacts: 1 } }),
    row("admission", { admissionState: "unconsumed", reconciled: [] }),
    row("preflight", { assessmentCandidateCount: 6, plannedSummaryGenerations: 1 }),
    row("operation_consumed", { jobId: base.jobId }), ...failures,
    row("stopped_requires_reconciliation", { manifestSha256: manifestFile.hash })];
  change?.(rows);
  const journal = save("journal.jsonl", rows.map((item) => JSON.stringify(item) + "\n").join(""));
  const evidence: RefreshCurrentAuthorityReconciliationEvidence = { ...base,
    reason: "consumed_job_without_provider_invocation", manifestSha256: manifestFile.hash,
    invocation: { evidenceKind: "journal_current_authority", manifestPath: manifestFile.path,
      journalPath: journal.path, journalSha256: journal.hash, invocationConsumedCount: 0,
      delegatedInvocationCount: 0, providerUsageReported: false, attempts } };
  return { root, evidence };
}
