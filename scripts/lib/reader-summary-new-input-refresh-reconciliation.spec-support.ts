import { refreshScope } from "./reader-summary-new-input-refresh-manifest";
import type { RefreshReconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation";

export const reconciliationDate = "2026-09-03";
export const reconciliationJobId = "1767fd5c-2fe5-4fef-84e0-22c380932e81";
export const reconciliationOperation =
  `new-input-refresh:v1:${reconciliationDate}:${"b".repeat(64)}`;

export const reconciliationEvidence = (
  override: Partial<RefreshReconciliationEvidence> = {},
): RefreshReconciliationEvidence => ({
  format: "reader-summary-new-input-refresh-reconciliation-v1",
  ...refreshScope, date: reconciliationDate, jobId: reconciliationJobId,
  operation: reconciliationOperation, manifestSha256: "3".repeat(64),
  reason: "consumed_provider_invocation_without_summary",
  invocation: { requestId: "reader-summary-story-relations:workspace:2026-09-06T23:27:45.056Z",
    purpose: "social_monitor.reader_summary.verify_story_relations.v2",
    requestSha256: "1".repeat(64), attemptSha256: "7".repeat(64),
    consumedAt: "2026-09-06T23:36:47.054Z", returnedAt: "2026-09-06T23:38:27.551Z",
    outcome: "completed", providerUsageReported: false },
  ...override,
});

export type FakeJobRow = {
  id: string; operation: string; status: string; artifactId: string | null;
  date: string; sha: string; publications: number;
};

/** Models only what the reviewed statements are allowed to do. Any write to a
 * job row, or any insert that skips a guard fragment, fails the test. */
export class FakeReconciliationDatabase {
  readonly reconciliations: Record<string, unknown>[] = [];
  readonly counters: Record<string, unknown>[] = [];
  private readonly frozen: string;
  constructor(readonly jobs: FakeJobRow[]) { this.frozen = JSON.stringify(jobs); }

  assertJobsUntouched(): void {
    if (JSON.stringify(this.jobs) !== this.frozen) {
      throw new Error("original job history was modified");
    }
  }

  readonly client = {
    $queryRaw: async <T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> => {
      const sql = strings.join(" ? ").replace(/\s+/gu, " ").trim();
      if (/^insert into reader_summary_new_input_refresh_reconciliations/u.test(sql)) {
        return this.insertReconciliation(sql, values) as T;
      }
      if (/^insert into reader_summary_new_input_refresh_reconciliation_counters/u.test(sql)) {
        return this.insertCounters(sql, values) as T;
      }
      if (/^select id::text as id, tenant_id/u.test(sql)) {
        return this.reconciliations.filter((row) => row.readerSummaryJobId === values[2]) as T;
      }
      if (/^select id::text as id, request_id/u.test(sql)) {
        return this.counters.filter((row) =>
          row.reconciliationId === values[1] && row.requestId === values[2]) as T;
      }
      if (/^select j.status::text as status/u.test(sql)) {
        const job = this.jobs.find((row) => row.id === values[0]);
        return (job === undefined ? [] : [{ status: job.status, operation: job.operation,
          artifactId: job.artifactId, publications: job.publications }]) as T;
      }
      throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
    },
  };

  private insertReconciliation(sql: string, values: readonly unknown[]) {
    for (const fragment of ["j.status::text = 'FAILED'", "j.reader_summary_artifact_id is null",
      "not exists (select 1 from reader_summary_publications p", "on conflict do nothing",
      "j.idempotency_key = ?", "j.tenant_id = ?"]) {
      if (!sql.includes(fragment)) throw new Error(`insert lost its guard: ${fragment}`);
    }
    const [id, manifestSha256, evidenceSha256, reason, invocation, accounting, now, jobId,
      tenantId, workspaceId, operation, date] = values as readonly string[];
    const job = this.jobs.find((row) => row.id === jobId && row.operation === operation &&
      row.date === date && row.status === "FAILED" && row.artifactId === null &&
      row.publications === 0 && tenantId === refreshScope.tenantId &&
      workspaceId === refreshScope.workspaceId);
    if (job === undefined) return [];
    if (this.reconciliations.some((row) => row.readerSummaryJobId === jobId ||
      row.operation === operation)) return [];
    this.reconciliations.push({ id, tenantId, workspaceId, readerSummaryJobId: job.id,
      operation: job.operation, jobStatus: job.status, jobSha256: job.sha, manifestSha256,
      evidenceSha256, reason, invocation: JSON.parse(invocation!) as unknown,
      accounting: JSON.parse(accounting!) as unknown, reconciledAt: new Date(now!) });
    return [{ id }];
  }

  private insertCounters(sql: string, values: readonly unknown[]) {
    for (const fragment of ["r.invocation->>'requestId' = ?", "r.invocation->>'attemptSha256' = ?",
      "on conflict do nothing"]) {
      if (!sql.includes(fragment)) throw new Error(`counters insert lost its guard: ${fragment}`);
    }
    const [id, requestId, attemptSha256, counters, countersSha256, evidenceSha256, provenance,
      now, reconciliationId, tenantId, workspaceId, jobId, date, boundRequestId,
      boundAttemptSha256] = values as readonly string[];
    const parent = this.reconciliations.find((row) => row.id === reconciliationId &&
      row.tenantId === tenantId && row.workspaceId === workspaceId &&
      row.readerSummaryJobId === jobId &&
      (row.invocation as { requestId: string }).requestId === boundRequestId &&
      (row.invocation as { attemptSha256: string }).attemptSha256 === boundAttemptSha256 &&
      this.jobs.some((job) => job.id === jobId && job.date === date));
    if (parent === undefined) return [];
    if (this.counters.some((row) => row.reconciliationId === reconciliationId &&
      row.requestId === requestId)) return [];
    this.counters.push({ id, reconciliationId, tenantId, workspaceId, requestId, attemptSha256,
      counters: JSON.parse(counters!) as unknown, countersSha256, evidenceSha256, provenance,
      recordedAt: new Date(now!) });
    return [{ id }];
  }
}
