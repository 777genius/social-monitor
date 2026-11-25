/** Parent-only native contract for the reconciliation schema. It creates no
 * reconciliation row: it proves the schema is protected and that the reviewed
 * insert refuses a job that is not a consumed, unpublished failure. */
import assert from "node:assert/strict";
import { CryptoIdGenerator } from "@social-monitor/shared-kernel";
import { refreshScope } from "./reader-summary-new-input-refresh-manifest";
import { readRefreshJobs, readRefreshReconciliations } from "./reader-summary-new-input-refresh-postgres";
import { refreshLiveJobs } from "./reader-summary-new-input-refresh-guard";
import { reconcileConsumedRefreshJob, type RefreshReconciliationEvidence } from
  "./reader-summary-new-input-refresh-reconciliation";

type Client = Readonly<{
  $queryRaw<T>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
}>;

const tables = [
  "reader_summary_new_input_refresh_reconciliations",
  "reader_summary_new_input_refresh_reconciliation_counters",
] as const;

export async function assertRefreshReconciliationContract(
  client: Client, date: string,
): Promise<void> {
  const protection = await client.$queryRaw<readonly {
    table: string; rls: boolean; force: boolean; policies: number; triggers: number;
  }[]>`
    select c.relname::text as table, c.relrowsecurity as rls, c.relforcerowsecurity as force,
      (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
      (select count(*)::int from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal) as triggers
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(${[...tables]}::text[])
    order by c.relname
  `;
  assert.equal(protection.length, tables.length, "reconciliation schema is missing");
  for (const row of protection) {
    assert.equal(row.rls, true, `${row.table} must enable RLS`);
    assert.equal(row.force, true, `${row.table} must force RLS`);
    assert.equal(row.policies, 1, `${row.table} must carry exactly the tenant policy`);
    assert.equal(row.triggers, 1, `${row.table} must stay append-only`);
  }
  const writable = await client.$queryRaw<readonly { grantee: string; priv: string }[]>`
    select grantee::text as grantee, privilege_type::text as priv
    from information_schema.table_privileges
    where table_schema = 'public' and table_name = any(${[...tables]}::text[])
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
  `;
  assert.deepEqual(writable, [], "reconciliation accounting must not be updatable or deletable");

  // The fixture's own job is RUNNING, not a consumed unpublished failure. The
  // reviewed insert must refuse it and leave the date's live budget untouched.
  const jobs = await readRefreshJobs(client, date);
  const live = refreshLiveJobs(jobs, await readRefreshReconciliations(client, date), "");
  assert.equal(live.length, jobs.length, "no fixture job is reconciled");
  const target = jobs[0];
  assert(target !== undefined, "fixture must own one consumed job");
  const evidence: RefreshReconciliationEvidence = {
    format: "reader-summary-new-input-refresh-reconciliation-v1",
    ...refreshScope, date, jobId: target.jobId, operation: target.operation,
    manifestSha256: "0".repeat(64), reason: "consumed_provider_invocation_without_summary",
    invocation: { requestId: "contract-check", purpose: "contract-check",
      requestSha256: "0".repeat(64), attemptSha256: "0".repeat(64),
      consumedAt: "2026-01-01T00:00:00.000Z", returnedAt: "2026-01-01T00:00:01.000Z",
      outcome: "completed", providerUsageReported: false },
  };
  await assert.rejects(reconcileConsumedRefreshJob({ client, evidence,
    evidenceSha256: "0".repeat(64), now: new Date(), ids: new CryptoIdGenerator() }),
  /not a consumed unpublished failure|does not exist/u);
  assert.deepEqual(await readRefreshReconciliations(client, date), [],
    "a refused reconciliation writes nothing");
  assert.deepEqual(await readRefreshJobs(client, date), jobs,
    "a refused reconciliation leaves the original job byte-identical");
}
