import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import { refreshBytesHash, refreshHash, refreshScope } from
  "./reader-summary-new-input-refresh-manifest";

/** Independently verified counters for a provider request that was ALREADY
 * consumed by a reconciled attempt. Supplemental evidence only: it explains an
 * existing cost, it never revives budget, never edits the reconciliation's own
 * accounting and never asserts the attempt produced a summary. */
export type RefreshReconciliationCountersEvidence = Readonly<{
  format: "reader-summary-new-input-refresh-reconciliation-counters-v1";
  tenantId: string; workspaceId: string; date: string;
  reconciliationId: string; jobId: string;
  requestId: string; attemptSha256: string;
  counters: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;
  provenance: "independently_verified_provider_statement";
  verifiedBy: string; verifiedAt: string;
}>;

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const counted = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export function assertRefreshReconciliationCountersEvidence(
  evidence: RefreshReconciliationCountersEvidence, dates: readonly string[],
): void {
  const counters = evidence?.counters;
  const verifiedAt = new Date(evidence?.verifiedAt ?? "");
  if (evidence?.format !== "reader-summary-new-input-refresh-reconciliation-counters-v1" ||
      evidence.tenantId !== refreshScope.tenantId ||
      evidence.workspaceId !== refreshScope.workspaceId ||
      !dates.includes(evidence.date) || !uuid.test(evidence.reconciliationId) ||
      !uuid.test(evidence.jobId) ||
      typeof evidence.requestId !== "string" || evidence.requestId.trim().length === 0 ||
      !sha256.test(evidence.attemptSha256) ||
      evidence.provenance !== "independently_verified_provider_statement" ||
      typeof evidence.verifiedBy !== "string" || evidence.verifiedBy.trim().length === 0 ||
      !Number.isFinite(verifiedAt.getTime()) || verifiedAt.toISOString() !== evidence.verifiedAt) {
    throw new Error("Refresh reconciliation counters identity is invalid");
  }
  if (typeof counters !== "object" || counters === null ||
      Object.keys(counters).length !== 3 ||
      !counted(counters.inputTokens) || !counted(counters.outputTokens) ||
      !counted(counters.totalTokens) ||
      counters.totalTokens !== counters.inputTokens + counters.outputTokens) {
    throw new Error("Refresh reconciliation counters are not a complete verified statement");
  }
}

export function readReviewedRefreshReconciliationCounters(
  path: string, expected: string, dates: readonly string[],
): { evidence: RefreshReconciliationCountersEvidence; evidenceSha256: string } {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (realpathSync(absolute) !== absolute || !stat.isFile() || stat.nlink !== 1 ||
      (stat.mode & 0o222) !== 0) {
    throw new Error("Refresh reconciliation counters must be a regular immutable file");
  }
  const bytes = readFileSync(absolute);
  const evidenceSha256 = refreshBytesHash(bytes);
  if (evidenceSha256 !== expected) throw new Error("Reviewed refresh counters hash differs");
  const evidence = JSON.parse(bytes.toString("utf8")) as RefreshReconciliationCountersEvidence;
  assertRefreshReconciliationCountersEvidence(evidence, dates);
  return { evidence, evidenceSha256 };
}

type WriteClient = Readonly<{
  $queryRaw<T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
}>;

type CountersRow = Readonly<{
  id: string; requestId: string; attemptSha256: string; counters: unknown;
  countersSha256: string; evidenceSha256: string; provenance: string; recordedAt: Date;
}>;

export type RefreshReconciliationCountersReceipt = Readonly<{
  status: "imported" | "already_imported";
  countersId: string; reconciliationId: string; requestId: string;
  attemptSha256: string; countersSha256: string; evidenceSha256: string;
  recordedAt: string;
}>;

/** The insert only resolves against a committed reconciliation whose recorded
 * invocation is exactly this request/attempt, so counters can never be attached
 * to an unrelated result. */
export async function importRefreshReconciliationCounters(input: {
  client: WriteClient; evidence: RefreshReconciliationCountersEvidence;
  evidenceSha256: string; now: Date; ids: IdGenerator;
}): Promise<RefreshReconciliationCountersReceipt> {
  const { client, evidence: e, evidenceSha256 } = input;
  const countersSha256 = refreshHash(e.counters);
  const inserted = await client.$queryRaw<readonly { id: string }[]>`
    insert into reader_summary_new_input_refresh_reconciliation_counters (
      id, reconciliation_id, tenant_id, workspace_id, request_id, attempt_sha256,
      counters, counters_sha256, evidence_sha256, provenance, recorded_at)
    select ${input.ids.generate()}::uuid, r.id, r.tenant_id, r.workspace_id,
      ${e.requestId}, ${e.attemptSha256}, ${JSON.stringify(e.counters)}::jsonb,
      ${countersSha256}, ${evidenceSha256}, ${e.provenance}, ${input.now}::timestamptz
    from reader_summary_new_input_refresh_reconciliations r
    where r.id = ${e.reconciliationId}::uuid
      and r.tenant_id = ${refreshScope.tenantId}::uuid
      and r.workspace_id = ${refreshScope.workspaceId}::uuid
      and r.reader_summary_job_id = ${e.jobId}::uuid
      and r.period_started_at = ${e.date}::date::timestamp at time zone 'UTC'
      and r.invocation->>'requestId' = ${e.requestId}
      and r.invocation->>'attemptSha256' = ${e.attemptSha256}
    on conflict do nothing
    returning id::text as id
  `;
  const rows = await client.$queryRaw<readonly CountersRow[]>`
    select id::text as id, request_id as "requestId", btrim(attempt_sha256) as "attemptSha256",
      counters, btrim(counters_sha256) as "countersSha256",
      btrim(evidence_sha256) as "evidenceSha256", provenance, recorded_at as "recordedAt"
    from reader_summary_new_input_refresh_reconciliation_counters
    where tenant_id = ${refreshScope.tenantId}::uuid
      and reconciliation_id = ${e.reconciliationId}::uuid
      and request_id = ${e.requestId}
  `;
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error("Refresh reconciliation counters do not reference the recorded original result");
  }
  if (row.attemptSha256 !== e.attemptSha256 || row.evidenceSha256 !== evidenceSha256 ||
      row.countersSha256 !== countersSha256 || row.provenance !== e.provenance ||
      refreshHash(row.counters) !== refreshHash(e.counters)) {
    throw new Error("Refresh reconciliation counters conflict with the committed evidence");
  }
  return { status: inserted.length === 1 ? "imported" : "already_imported",
    countersId: row.id, reconciliationId: e.reconciliationId, requestId: row.requestId,
    attemptSha256: row.attemptSha256, countersSha256: row.countersSha256,
    evidenceSha256: row.evidenceSha256, recordedAt: row.recordedAt.toISOString() };
}
