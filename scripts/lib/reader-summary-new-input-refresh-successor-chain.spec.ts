import type * as PGliteModule from "@electric-sql/pglite";
import { assertRefreshSuccessorCurrent } from "./reader-summary-new-input-refresh-successor";
import { refreshOperation } from "./reader-summary-new-input-refresh-manifest";
import { refreshReconciliationAccounting, refreshReconciliationAccountingFor } from
  "./reader-summary-new-input-refresh-reconciliation";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";
import { chainedSuccessorManifests, chainedRootEvidence, chainedFirstSuccessorEvidence,
  chainedRootJobId, chainedFirstSuccessorJobId } from "./reader-summary-new-input-refresh-successor.spec-support";

// The production defect: a reconciled terminal story-relation-verification
// failure inside the FIRST successor manifest needs its own successor. This
// suite proves the exact bounded two-stage shape is admitted end to end
// (through the real SQL, not a mocked predicate) while depth-3, wrong-purpose
// and tampered variants stay rejected.
describe("bounded two-stage successor recovery: SQL-verified chain", () => {
  let db: PGliteModule.PGlite;
  const chain = chainedSuccessorManifests();
  const rootEvidence = chainedRootEvidence(chain);
  const firstEvidence = chainedFirstSuccessorEvidence(chain);
  const client = { $queryRaw: async <T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> => {
    const sql = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
    return (await db.query(sql, [...values])).rows as T;
  } };

  const insertHop = async (jobId: string, reconciliationId: string,
    evidence: ReturnType<typeof chainedRootEvidence>) => {
    await db.query(`insert into reader_summary_jobs (id, tenant_id, workspace_id, status, idempotency_key,
      failed_at, cadence, scope_type, scope_key, period_timezone, period_started_at, period_ended_at)
      values ($1, $2, $3, 'FAILED', $4, $5, 'daily', 'workspace', 'workspace', 'UTC', $6, $7)`,
    [jobId, chain.second.tenantId, chain.second.workspaceId, evidence.operation, refreshNow.toISOString(),
      chain.second.startedAt, chain.second.endedAt]);
    await db.query(`insert into reader_summary_new_input_refresh_reconciliations
      select $1, j.tenant_id, j.workspace_id, j.id, j.idempotency_key, j.status,
        encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex'), $2,
        j.period_started_at, j.period_ended_at, $3, $4::jsonb, $5::jsonb from reader_summary_jobs j where j.id = $6`,
    [reconciliationId, evidence.manifestSha256, evidence.reason, JSON.stringify(evidence.invocation),
      JSON.stringify(refreshReconciliationAccounting), jobId]);
  };

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
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("begin");
    await insertHop(chainedRootJobId, chain.first.successor!.reconciliationId, rootEvidence);
    await insertHop(chainedFirstSuccessorJobId, chain.second.successor!.reconciliationId, firstEvidence);
  });
  afterEach(async () => { await db.exec("rollback"); });

  it("accepts the exact production-shaped two-stage recovery chain", async () => {
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).resolves.toBeUndefined();
  });

  it("rejects the chain when the immediate (first-successor) hop purpose is not story-relation verification", async () => {
    const invocation = { ...firstEvidence.invocation, purpose: "social_monitor.relevance.assess_source_content.v1" };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb where reader_summary_job_id=$3",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...firstEvidence, invocation })), chainedFirstSuccessorJobId]);
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).rejects.toThrow(/story-relation/);
  });

  it("accepts the chain when the root hop is also a terminal story-relation verification failure", async () => {
    const invocation = { ...rootEvidence.invocation, purpose: "social_monitor.reader_summary.verify_story_relations.v2" };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb where reader_summary_job_id=$3",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...rootEvidence, invocation })), chainedRootJobId]);
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).resolves.toBeUndefined();
  });

  it("rejects the chain when the root hop purpose is neither the source-content assessment nor story-relation verification", async () => {
    const invocation = { ...rootEvidence.invocation, purpose: "social_monitor.relevance.assess_other_signal.v1" };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb where reader_summary_job_id=$3",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...rootEvidence, invocation })), chainedRootJobId]);
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).rejects.toThrow(/source-content assessment/);
  });

  it("rejects the chain when the root hop is not itself a terminal outcome", async () => {
    const invocation = { ...rootEvidence.invocation, outcome: "running" };
    await db.query("update reader_summary_new_input_refresh_reconciliations set invocation=$1::jsonb, accounting=$2::jsonb where reader_summary_job_id=$3",
      [JSON.stringify(invocation), JSON.stringify(refreshReconciliationAccountingFor({ ...rootEvidence, invocation })), chainedRootJobId]);
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).rejects.toThrow(/source-content assessment/);
  });

  it("rejects the chain when the root hop's committed manifest bytes no longer match", async () => {
    await db.query("update reader_summary_new_input_refresh_reconciliations set manifest_sha256=repeat('b',64) where reader_summary_job_id=$1",
      [chainedRootJobId]);
    await expect(assertRefreshSuccessorCurrent(client, chain.second, refreshNow)).rejects.toThrow(/missing, changed/);
  });

  it("rejects a third-stage extension of the chain before any query is even needed", async () => {
    const thirdDraft = { ...chain.second, successor: {
      format: "reader-summary-new-input-refresh-successor-v1" as const,
      originalJobId: "00000000-0000-4000-8000-000000000050",
      reconciliationId: "00000000-0000-4000-8000-000000000051",
      originalManifestJson: JSON.stringify(chain.second), expiresAt: "2026-09-05T22:25:00.000Z",
    } };
    const third = { ...thirdDraft, operation: refreshOperation(thirdDraft) };
    await expect(assertRefreshSuccessorCurrent(client, third, refreshNow)).rejects.toThrow(/depth/);
  });
});
