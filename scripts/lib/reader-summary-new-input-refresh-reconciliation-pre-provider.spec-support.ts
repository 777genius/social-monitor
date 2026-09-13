import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { refreshBytesHash, refreshHash } from "./reader-summary-new-input-refresh-manifest";
import type { RefreshPreProviderReconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation";
import { reconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation.spec-support";

export function preProviderFixture(change?: (value: {
  models: Record<string, unknown>[]; journal: Record<string, unknown>[];
  manifest: Record<string, unknown>;
}) => void, commandOverride?: (command: Record<string, unknown>) => void) {
  const root = mkdtempSync(join(tmpdir(), "refresh-pre-provider-spec-"));
  const capturePath = join(root, "capture");
  mkdirSync(capturePath);
  const base = reconciliationEvidence();
  const scope = { tenantId: base.tenantId, workspaceId: base.workspaceId,
    operation: base.operation, observedThrough: "2026-09-07T00:00:00.000Z" };
  const manifest = { format: "reader-summary-seven-day-new-input-v1", ...scope, date: base.date };
  const models: Record<string, unknown>[] = [];
  const journal: Record<string, unknown>[] = [{ at: "2026-09-07T00:00:00.000Z",
    event: { status: "operation_consumed", operation: base.operation, jobId: base.jobId } }];
  const attempts = Array.from({ length: 6 }, (_, index) => {
    // Match the assessment adapter's command shape, including the optional own
    // property that JSON capture omits but the historical journal hash retains.
    const command = { tenantId: base.tenantId, workspaceId: base.workspaceId,
      requestId: `synthetic-${index}`, correlationId: `synthetic-${index}`,
      provider: "codex", providerInstanceId: undefined,
      purpose: "social_monitor.relevance.assess_source_content.v1",
      systemPrompt: "Synthetic instruction", prompt: '{"candidates":[]}', outputSchema: {},
      controls: { interactive: false, model: "gpt-5.6-sol", reasoningEffort: "low",
        outputSchemaName: "social_monitor_source_content_quality_review",
        schemaVersion: "source_content_assessment.v1", maxOutputTokens: 6000 },
      timeoutMs: 1000, metadata: { adapter: "agent-runtime-source-content-quality-reviewer" } };
    commandOverride?.(command);
    const started = { sequence: index + 1, atMs: Date.parse("2026-09-07T00:00:01.000Z"),
      event: { kind: "invocation_started", command } };
    const failed = { sequence: index + 7, atMs: Date.parse("2026-09-07T00:00:02.000Z"),
      event: { kind: "invocation_failed", requestId: command.requestId, delegated: false } };
    models.push(started, failed);
    journal.push({ at: "2026-09-07T00:00:02.000Z", event: { status: "requires_reconciliation",
      operation: base.operation, requestId: command.requestId, purpose: command.purpose,
      requestSha256: refreshHash(command) } });
    return { requestId: command.requestId, purpose: command.purpose, requestSha256: refreshHash(command),
      attemptSha256: refreshHash(JSON.parse(JSON.stringify({ started, failed }))), startedAt: "2026-09-07T00:00:01.000Z",
      failedAt: "2026-09-07T00:00:02.000Z", outcome: "invocation_failed" as const, delegated: false as const };
  });
  models.sort((a, b) => Number(a.sequence) - Number(b.sequence));
  change?.({ models, journal, manifest });
  const save = (path: string, text: string) => {
    writeFileSync(path, text, { mode: 0o600 });
    chmodSync(path, 0o400);
    return refreshBytesHash(Buffer.from(text));
  };
  const manifestPath = join(root, "manifest.json");
  const manifestSha256 = save(manifestPath, JSON.stringify(manifest) + "\n");
  journal.push({ at: "2026-09-07T00:00:03.000Z", event: { status: "stopped_requires_reconciliation",
    operation: base.operation, manifestSha256 } });
  const journalPath = join(root, "journal.jsonl");
  const journalSha256 = save(journalPath, journal.map((row) => JSON.stringify(row) + "\n").join(""));
  const content = { "started.json": JSON.stringify({ format: "reader-refresh-paired-capture.v1", scope }) + "\n",
    "controls.json": JSON.stringify({ manifest }) + "\n",
    "models.jsonl": models.map((row) => JSON.stringify(row) + "\n").join("") };
  const files = Object.entries(content).map(([name, text]) => ({ name, bytes: Buffer.byteLength(text),
    sha256: save(join(capturePath, name), text) }));
  const captureSha256 = save(join(capturePath, "incomplete.json"), JSON.stringify({
    format: "reader-refresh-paired-capture.v1", scope, complete: false,
    failures: ["refresh_incomplete"], files, observationCounts: { modelRequests: 6 } }) + "\n");
  const evidence: RefreshPreProviderReconciliationEvidence = { ...base, manifestSha256,
    reason: "consumed_job_without_provider_invocation", invocation: {
      capturePath, journalPath, manifestPath, captureSha256, journalSha256,
      invocationConsumedCount: 0, delegatedInvocationCount: 0, providerUsageReported: false, attempts } };
  return { root, evidence };
}
