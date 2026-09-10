import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { IdGenerator } from "@social-monitor/shared-kernel";
import { refreshBytesHash, refreshHash, refreshKeyPrefix, refreshScope } from
  "./reader-summary-new-input-refresh-manifest";

/** Operator-reviewed statement that one consumed new-input-refresh attempt is
 * accounted for. It asserts consumption, never success: the original job row is
 * never written to, and provider usage stays explicitly unknown. */
export type RefreshReconciliationEvidence = Readonly<{
  format: "reader-summary-new-input-refresh-reconciliation-v1";
  tenantId: string; workspaceId: string; date: string;
  jobId: string; operation: string; manifestSha256: string;
  reason: "consumed_provider_invocation_without_summary";
  invocation: Readonly<{
    requestId: string; purpose: string; requestSha256: string;
    attemptSha256: string; consumedAt: string; returnedAt: string;
    outcome: string; providerUsageReported: boolean;
    usage?: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;
  }>;
}>;

export const refreshReconciliationAccounting = Object.freeze({
  summaryGenerations: 0, publications: 0, artifacts: 0,
  providerInvocations: 1, providerUsage: "unknown" as const,
});
export const refreshReconciliationAccountingFor = (evidence: RefreshReconciliationEvidence) =>
  evidence.invocation.providerUsageReported
    ? Object.freeze({ ...refreshReconciliationAccounting, providerUsage: "reported" as const,
      usage: evidence.invocation.usage! })
    : refreshReconciliationAccounting;

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const isoInstant = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

export function assertRefreshReconciliationEvidence(
  evidence: RefreshReconciliationEvidence, dates: readonly string[],
): void {
  const invocation = evidence?.invocation;
  if (evidence?.format !== "reader-summary-new-input-refresh-reconciliation-v1" ||
      evidence.tenantId !== refreshScope.tenantId ||
      evidence.workspaceId !== refreshScope.workspaceId ||
      !dates.includes(evidence.date) || !uuid.test(evidence.jobId) ||
      typeof evidence.operation !== "string" ||
      !evidence.operation.startsWith(refreshKeyPrefix(evidence.date)) ||
      !sha256.test(evidence.operation.slice(refreshKeyPrefix(evidence.date).length)) ||
      !sha256.test(evidence.manifestSha256) ||
      evidence.reason !== "consumed_provider_invocation_without_summary") {
    throw new Error("Refresh reconciliation evidence identity is invalid");
  }
  if (typeof invocation !== "object" || invocation === null ||
      typeof invocation.requestId !== "string" || invocation.requestId.trim().length === 0 ||
      typeof invocation.purpose !== "string" || invocation.purpose.trim().length === 0 ||
      !sha256.test(invocation.requestSha256) || !sha256.test(invocation.attemptSha256) ||
      !isoInstant(invocation.consumedAt) || !isoInstant(invocation.returnedAt) ||
      Date.parse(invocation.returnedAt) < Date.parse(invocation.consumedAt) ||
      typeof invocation.outcome !== "string" || invocation.outcome.trim().length === 0 ||
      typeof invocation.providerUsageReported !== "boolean" ||
      (invocation.providerUsageReported
        ? invocation.usage === undefined || ![invocation.usage.inputTokens, invocation.usage.outputTokens,
          invocation.usage.totalTokens].every((count) => Number.isSafeInteger(count) && count >= 0) ||
          invocation.usage.totalTokens !== invocation.usage.inputTokens + invocation.usage.outputTokens
        : invocation.usage !== undefined)) {
    throw new Error("Refresh reconciliation invocation identity is invalid");
  }
}

export function readReviewedRefreshReconciliation(
  path: string, expected: string, dates: readonly string[],
): { evidence: RefreshReconciliationEvidence; evidenceSha256: string } {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (realpathSync(absolute) !== absolute || !stat.isFile() || stat.nlink !== 1 ||
      (stat.mode & 0o222) !== 0) {
    throw new Error("Refresh reconciliation evidence must be a regular immutable file");
  }
  const bytes = readFileSync(absolute);
  const evidenceSha256 = refreshBytesHash(bytes);
  if (evidenceSha256 !== expected) throw new Error("Reviewed refresh reconciliation hash differs");
  const evidence = JSON.parse(bytes.toString("utf8")) as RefreshReconciliationEvidence;
  assertRefreshReconciliationEvidence(evidence, dates);
  return { evidence, evidenceSha256 };
}

export type RefreshReconciliationRow = Readonly<{
  id: string; tenantId: string; workspaceId: string;
  readerSummaryJobId: string; operation: string; jobStatus: string;
  jobSha256: string; manifestSha256: string; evidenceSha256: string;
  reason: string; invocation: unknown; accounting: unknown; reconciledAt: Date;
}>;

type WriteClient = Readonly<{
  $queryRaw<T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
}>;

const selectReconciliation = (client: WriteClient, jobId: string) =>
  client.$queryRaw<readonly RefreshReconciliationRow[]>`
    select id::text as id, tenant_id::text as "tenantId", workspace_id::text as "workspaceId",
      reader_summary_job_id::text as "readerSummaryJobId", operation,
      job_status as "jobStatus", btrim(job_sha256) as "jobSha256",
      btrim(manifest_sha256) as "manifestSha256", btrim(evidence_sha256) as "evidenceSha256",
      reason, invocation, accounting, reconciled_at as "reconciledAt"
    from reader_summary_new_input_refresh_reconciliations
    where tenant_id = ${refreshScope.tenantId}::uuid
      and workspace_id = ${refreshScope.workspaceId}::uuid
      and reader_summary_job_id = ${jobId}::uuid
  `;

/** One statement decides everything: the row is inserted only if the original
 * job is still exactly the consumed, unpublished FAILED attempt named by the
 * reviewed evidence, and its own digest is captured from that same row. */
const insertReconciliation = (client: WriteClient, input: {
  id: string; evidence: RefreshReconciliationEvidence; evidenceSha256: string; now: Date;
}) => {
  const { evidence: e } = input;
  return client.$queryRaw<readonly { id: string }[]>`
    insert into reader_summary_new_input_refresh_reconciliations (
      id, tenant_id, workspace_id, period_started_at, period_ended_at,
      reader_summary_job_id, operation, job_status, job_sha256, manifest_sha256,
      evidence_sha256, reason, invocation, accounting, reconciled_at)
    select ${input.id}::uuid, j.tenant_id, j.workspace_id, j.period_started_at, j.period_ended_at,
      j.id, j.idempotency_key, j.status::text,
      encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'),
      ${e.manifestSha256}, ${input.evidenceSha256}, ${e.reason},
      ${JSON.stringify(e.invocation)}::jsonb,
      ${JSON.stringify(refreshReconciliationAccountingFor(e))}::jsonb,
      ${input.now}::timestamptz
    from reader_summary_jobs j
    where j.id = ${e.jobId}::uuid
      and j.tenant_id = ${refreshScope.tenantId}::uuid
      and j.workspace_id = ${refreshScope.workspaceId}::uuid
      and j.idempotency_key = ${e.operation}
      and j.status::text = 'FAILED'
      and j.reader_summary_artifact_id is null
      and j.cadence = 'daily' and j.scope_type = 'workspace' and j.scope_key = 'workspace'
      and j.period_timezone = 'UTC'
      and j.period_started_at = ${e.date}::date::timestamp at time zone 'UTC'
      and j.period_ended_at = (${e.date}::date + 1)::timestamp at time zone 'UTC'
      and j.interest_id is null and j.user_id is null and j.subscription_id is null
      and not exists (select 1 from reader_summary_publications p
        where p.reader_summary_job_id = j.id)
      and not exists (select 1 from reader_summary_artifacts a
        where a.id = j.reader_summary_artifact_id)
    on conflict do nothing
    returning id::text as id
  `;
};

/** Why the reviewed job could not be accounted for. Read-only diagnosis; it
 * never relaxes the insert conditions. */
const diagnoseJob = async (client: WriteClient, evidence: RefreshReconciliationEvidence) => {
  const rows = await client.$queryRaw<readonly {
    status: string; operation: string; artifactId: string | null; publications: number;
  }[]>`
    select j.status::text as status, j.idempotency_key as operation,
      j.reader_summary_artifact_id::text as "artifactId",
      (select count(*)::int from reader_summary_publications p
        where p.reader_summary_job_id = j.id) as publications
    from reader_summary_jobs j
    where j.id = ${evidence.jobId}::uuid
      and j.tenant_id = ${refreshScope.tenantId}::uuid
      and j.workspace_id = ${refreshScope.workspaceId}::uuid
  `;
  return rows[0];
};

export type RefreshReconciliationReceipt = Readonly<{
  status: "reconciled" | "already_reconciled";
  reconciliationId: string; jobId: string; operation: string;
  jobSha256: string; evidenceSha256: string; reconciledAt: string;
  accounting: ReturnType<typeof refreshReconciliationAccountingFor>;
}>;

/** Idempotent: an exact replay returns the committed record; anything that
 * differs is a conflict, never a second record and never a reset. */
export async function reconcileConsumedRefreshJob(input: {
  client: WriteClient; evidence: RefreshReconciliationEvidence;
  evidenceSha256: string; now: Date; ids: IdGenerator;
}): Promise<RefreshReconciliationReceipt> {
  const { client, evidence, evidenceSha256 } = input;
  const accounting = refreshReconciliationAccountingFor(evidence);
  const inserted = await insertReconciliation(client,
    { id: input.ids.generate(), evidence, evidenceSha256, now: input.now });
  const rows = await selectReconciliation(client, evidence.jobId);
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    const observed = await diagnoseJob(client, evidence);
    throw new Error(observed === undefined
      ? "Refresh reconciliation target job does not exist in this workspace"
      : `Refresh reconciliation target job is not a consumed unpublished failure (status=${observed.status}, publications=${observed.publications})`);
  }
  if (row.operation !== evidence.operation || row.jobStatus !== "FAILED" ||
      row.manifestSha256 !== evidence.manifestSha256 ||
      row.evidenceSha256 !== evidenceSha256 || row.reason !== evidence.reason ||
      refreshHash(row.invocation) !== refreshHash(evidence.invocation) ||
      refreshHash(row.accounting) !== refreshHash(accounting)) {
    throw new Error("Refresh reconciliation conflicts with the committed record for this job");
  }
  return { status: inserted.length === 1 ? "reconciled" : "already_reconciled",
    reconciliationId: row.id, jobId: row.readerSummaryJobId, operation: row.operation,
    jobSha256: row.jobSha256, evidenceSha256: row.evidenceSha256,
    reconciledAt: row.reconciledAt.toISOString(), accounting };
}
