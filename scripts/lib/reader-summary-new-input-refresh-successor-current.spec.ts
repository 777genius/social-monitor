import type * as PGliteModule from "@electric-sql/pglite";
import { assertRefreshSuccessorCurrent } from "./reader-summary-new-input-refresh-successor";
import { refreshOperation } from "./reader-summary-new-input-refresh-manifest";
import { refreshReconciliationAccounting, refreshReconciliationAccountingFor } from
  "./reader-summary-new-input-refresh-reconciliation";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { successorManifest, successorEvidence } from "./reader-summary-new-input-refresh-successor.spec-support";

// An isolated in-memory PostgreSQL engine: these tests execute the actual query,
// not a mock boolean for the job/reconciliation predicates. No external DB.
describe("successor original and reconciliation SQL", () => {
  let db: PGliteModule.PGlite;
  const m = successorManifest(), e = successorEvidence(m);
  const client = { $queryRaw: async <T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> => {
    const sql = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return (await db.query(sql, [...values])).rows as T;
  } };
  beforeAll(async () => {
    // Native loader keeps PGlite's internal dynamic imports outside Jest's VM;
    // the ordinary repository test command needs no experimental VM flags.
    const { PGlite: MemoryPostgres } = process.getBuiltinModule("module").createRequire(__filename)("@electric-sql/pglite") as typeof PGliteModule;
    db = new MemoryPostgres();
    await db.exec(`create table reader_summary_jobs (
      id uuid primary key, tenant_id uuid, workspace_id uuid, status text, idempotency_key text,
      reader_summary_artifact_id uuid, completed_at timestamptz, failed_at timestamptz,
      cadence text, scope_type text, scope_key text, period_timezone text,
      interest_id uuid, user_id text, subscription_id uuid,
      period_started_at timestamptz, period_ended_at timestamptz,
      unique(tenant_id, idempotency_key));
      create table reader_summary_publications (reader_summary_job_id uuid);
      create table reader_summary_new_input_refresh_reconciliations (
        id uuid primary key, tenant_id uuid, workspace_id uuid, reader_summary_job_id uuid,
        operation text, job_status text, job_sha256 text, manifest_sha256 text,
        period_started_at timestamptz, period_ended_at timestamptz, reason text, invocation jsonb, accounting jsonb,
        unique(tenant_id, workspace_id, reader_summary_job_id), unique(tenant_id, operation));`);
    await db.query(`insert into reader_summary_jobs (id, tenant_id, workspace_id, status, idempotency_key,
      failed_at, cadence, scope_type, scope_key, period_timezone, period_started_at, period_ended_at)
      values ($1, $2, $3, 'FAILED', $4, $5, 'daily', 'workspace', 'workspace', 'UTC', $6, $7)`,
    [e.jobId, m.tenantId, m.workspaceId, e.operation, refreshNow.toISOString(), m.startedAt, m.endedAt]);
    await db.query(`insert into reader_summary_new_input_refresh_reconciliations
      select $1, j.tenant_id, j.workspace_id, j.id, j.idempotency_key, j.status,
        encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'), $2,
        j.period_started_at, j.period_ended_at, $3, $4::jsonb, $5::jsonb from reader_summary_jobs j`,
    [m.successor!.reconciliationId, e.manifestSha256, e.reason, JSON.stringify(e.invocation), JSON.stringify(refreshReconciliationAccounting)]);
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback"); });

  it("accepts exact unpublished FAILED original and keeps provider usage unknown", async () => {
    await expect(assertRefreshSuccessorCurrent(client, m, refreshNow)).resolves.toBeUndefined();
    expect((await db.query<{ accounting: unknown }>("select accounting from reader_summary_new_input_refresh_reconciliations")).rows[0]!.accounting)
      .toEqual(refreshReconciliationAccounting);
  });
  it("accepts a terminal story-relation verification failure", async () => {
    const invocation = { ...e.invocation,
      purpose: "social_monitor.reader_summary.verify_story_relations.v2", outcome: "failed" as const };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...e, invocation }))]);
    await expect(assertRefreshSuccessorCurrent(client, m, refreshNow)).resolves.toBeUndefined();
  });
  it("accepts exact provider-reported usage preserved by reconciliation", async () => {
    const usage = { inputTokens: 90_824, outputTokens: 6_325, totalTokens: 97_149 };
    const invocation = { ...e.invocation, outcome: "completed", providerUsageReported: true, usage };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...e, invocation }))]);
    await expect(assertRefreshSuccessorCurrent(client, m, refreshNow)).resolves.toBeUndefined();
  });
  it.each([
    "update reader_summary_jobs set status='RUNNING'",
    "update reader_summary_jobs set status='COMPLETED'",
    "update reader_summary_jobs set reader_summary_artifact_id='00000000-0000-4000-8000-000000000099'",
    "update reader_summary_jobs set completed_at=now()",
    "update reader_summary_jobs set failed_at=null",
    "update reader_summary_jobs set failed_at=failed_at + interval '1 second'",
    "update reader_summary_jobs set period_timezone='Europe/Kyiv'",
    "update reader_summary_jobs set workspace_id='00000000-0000-4000-8000-000000000099'",
    "update reader_summary_new_input_refresh_reconciliations set operation='different'",
    "update reader_summary_new_input_refresh_reconciliations set manifest_sha256=repeat('b',64)",
    "update reader_summary_new_input_refresh_reconciliations set job_status='COMPLETED'",
    "update reader_summary_new_input_refresh_reconciliations set period_ended_at=period_ended_at + interval '1 day'",
    "update reader_summary_new_input_refresh_reconciliations set accounting=jsonb_set(accounting,'{artifacts}','1')",
    "update reader_summary_new_input_refresh_reconciliations set accounting=jsonb_set(accounting,'{providerUsage}','\"known\"')",
    "update reader_summary_new_input_refresh_reconciliations set invocation=jsonb_set(invocation,'{outcome}','\"unknown\"')",
    "update reader_summary_new_input_refresh_reconciliations set invocation=jsonb_set(invocation,'{outcome}','\"completed\"')",
    "delete from reader_summary_new_input_refresh_reconciliations",
    "insert into reader_summary_publications select id from reader_summary_jobs",
  ])("rejects changed or ambiguous history: %s", async (sql) => {
    await db.exec(sql);
    await expect(assertRefreshSuccessorCurrent(client, m, refreshNow)).rejects.toThrow(/Refresh successor/);
  });
  it.each(["originalJobId", "reconciliationId"] as const)("cannot mint a valid second identity by changing %s", async (field) => {
    const changed = { ...m, successor: { ...m.successor!, [field]: "00000000-0000-4000-8000-000000000099" } };
    await expect(assertRefreshSuccessorCurrent(client, { ...changed, operation: refreshOperation(changed) }, refreshNow)).rejects.toThrow(/missing/);
  });
  it("binds the exact original manifest bytes, including whitespace", async () => {
    const changed = { ...m, successor: { ...m.successor!, originalManifestJson: m.successor!.originalManifestJson + "\n" } };
    expect(refreshOperation(changed)).toBe(m.operation);
    await expect(assertRefreshSuccessorCurrent(client, changed, refreshNow)).rejects.toThrow(/changed/);
  });
  it("existing constraints forbid a second reconciliation or successor operation", async () => {
    await expect(db.query(`insert into reader_summary_new_input_refresh_reconciliations
      select '00000000-0000-4000-8000-000000000099', tenant_id, workspace_id, reader_summary_job_id,
        operation, job_status, job_sha256, manifest_sha256, period_started_at, period_ended_at, reason, invocation, accounting
        from reader_summary_new_input_refresh_reconciliations`)).rejects.toMatchObject({ code: "23505" });
    await db.exec("rollback; begin");
    const insert = (id: string) => db.query("insert into reader_summary_jobs (id, tenant_id, idempotency_key) values ($1, $2, $3)",
      [id, m.tenantId, m.operation]);
    const results = await Promise.allSettled([insert("00000000-0000-4000-8000-000000000021"), insert("00000000-0000-4000-8000-000000000022")]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    // PGlite serializes one session; multi-connection lock transfer is tested
    // separately as a contract, not claimed as native concurrency evidence.
  });
});
