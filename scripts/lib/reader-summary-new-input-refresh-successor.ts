import type { Clock } from "@social-monitor/shared-kernel";
import type { ReaderSummaryJob } from "@social-monitor/summary/domain";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { assertRefreshManifest, refreshBytesHash, refreshHash,
  type RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { refreshReconciliationAccountingFor, assertRefreshReconciliationEvidence,
  type RefreshReconciliationEvidence } from "./reader-summary-new-input-refresh-reconciliation";
import { captureRefreshDatabaseAuthority } from "./reader-summary-new-input-refresh-capture";
import { lockRefreshAuthority, readRefreshJobs, readRefreshPrior, readRefreshReconciliations } from
  "./reader-summary-new-input-refresh-postgres";
import { assertRefreshEqual, refreshLiveJobs } from "./reader-summary-new-input-refresh-guard";
import { assertRefreshSuccessorGrant } from "./reader-summary-new-input-refresh-successor-grant";
import { withRefreshPublicationLocks } from "./reader-summary-new-input-refresh-publication-lock";

type Client = Pick<PrismaReaderSummaryClient, "$queryRaw">;
/** Verify the committed reconciliation and the exact unchanged FAILED row.
 * Unknown provider usage remains unknown; a grant supplies no usage estimate. */
export async function assertRefreshSuccessorCurrent(client: Client, m: RefreshManifest, now: Date) {
  assertRefreshManifest(m, now);
  const original = assertRefreshSuccessorGrant(m, now, { assertOriginal: assertRefreshManifest, hash: refreshHash });
  const grant = m.successor!;
  const rows = await client.$queryRaw<readonly {
    evidence: RefreshReconciliationEvidence; accounting: unknown; valid: boolean;
  }[]>`
    select jsonb_build_object('format', 'reader-summary-new-input-refresh-reconciliation-v1',
      'tenantId', r.tenant_id, 'workspaceId', r.workspace_id, 'date', ${m.date}::text,
      'jobId', r.reader_summary_job_id, 'operation', r.operation,
      'manifestSha256', btrim(r.manifest_sha256), 'reason', r.reason,
      'invocation', r.invocation) as evidence, r.accounting,
      (j.status::text = 'FAILED' and r.job_status = 'FAILED'
        and j.reader_summary_artifact_id is null and j.completed_at is null and j.failed_at is not null
        and btrim(r.job_sha256) = encode(sha256(convert_to(to_jsonb(j)::text, 'UTF8')), 'hex')
        and j.idempotency_key = r.operation and r.operation = ${original.operation}
        and btrim(r.manifest_sha256) = ${refreshBytesHash(Buffer.from(grant.originalManifestJson))}
        and j.cadence = 'daily' and j.scope_type = 'workspace' and j.scope_key = 'workspace'
        and j.period_timezone = 'UTC' and j.interest_id is null
        and j.user_id is null and j.subscription_id is null
        and j.period_started_at = ${m.startedAt}::timestamptz
        and j.period_ended_at = ${m.endedAt}::timestamptz
        and r.period_started_at = j.period_started_at and r.period_ended_at = j.period_ended_at
        and not exists (select 1 from reader_summary_publications p where p.reader_summary_job_id = j.id)
      ) as valid
    from reader_summary_new_input_refresh_reconciliations r
    join reader_summary_jobs j on j.id = r.reader_summary_job_id
      and j.tenant_id = r.tenant_id and j.workspace_id = r.workspace_id
    where r.id = ${grant.reconciliationId}::uuid
      and r.reader_summary_job_id = ${grant.originalJobId}::uuid
      and r.tenant_id = ${m.tenantId}::uuid and r.workspace_id = ${m.workspaceId}::uuid
  `;
  const row = rows[0];
  if (rows.length !== 1 || row?.valid !== true) {
    throw new Error("Refresh successor original/reconciliation is missing, changed or not an unpublished failure");
  }
  assertRefreshReconciliationEvidence(row.evidence, [m.date]);
  if (refreshHash(row.accounting) !== refreshHash(refreshReconciliationAccountingFor(row.evidence))) {
    throw new Error("Refresh successor original/reconciliation is missing, changed or not an unpublished failure");
  }
  const invocation = row.evidence.invocation;
  const knownTerminalAssessment = invocation.outcome === "failed" ||
    (invocation.outcome === "completed" && invocation.providerUsageReported);
  const resumablePurposes = new Set([
    "social_monitor.relevance.assess_source_content.v1",
    "social_monitor.reader_summary.verify_story_relations.v2",
  ]);
  if (!knownTerminalAssessment || !resumablePurposes.has(invocation.purpose)) {
    throw new Error("Refresh successor requires a known terminal resumable provider outcome");
  }
}

/** Insert-only consumption uses the existing tenant/operation UNIQUE key. Every
 * version of this single grant has the SAME operation. A concurrent insert,
 * recapture or reconciliation of the successor can never reset that row.
 * No provider work runs inside this transaction and no transaction is retried. */
export async function consumeRefreshSuccessor(input: {
  summary: Pick<PrismaSummaryConnection, "$transaction">; manifest: RefreshManifest;
  job: ReaderSummaryJob; clock: Clock; assertLocal(): void;
}): Promise<void> {
  const { manifest: m, clock } = input;
  const job = input.job.toSnapshot();
  if (!m.successor || job.status !== "requested" || job.idempotencyKey !== m.operation ||
      job.tenantId !== m.tenantId || job.workspaceId !== m.workspaceId ||
      job.scope.type !== "workspace" || job.userId !== undefined || job.subscriptionId !== undefined ||
      job.period.startedAt.toISOString() !== m.startedAt || job.period.endedAt.toISOString() !== m.endedAt ||
      job.period.cadence !== "daily" || job.period.timezone !== "UTC") {
    throw new Error("Refresh successor request identity mismatch");
  }
  await withRefreshPublicationLocks(input.summary, (assertProtected) => input.summary.$transaction(async (tx) => {
    input.assertLocal(); assertRefreshManifest(m, clock.now());
    await assertProtected(tx);
    // Upgrade without waiting on another admission holder. Failure rolls back
    // without consuming; a committed insert can never be reused or reset.
    if (!("$executeRaw" in tx) || typeof tx.$executeRaw !== "function") {
      throw new Error("Refresh successor requires transaction locks");
    }
    await tx.$executeRaw`lock table reader_summary_jobs in share row exclusive mode nowait`;
    await assertRefreshSuccessorCurrent(tx, m, clock.now());
    if (refreshLiveJobs(await readRefreshJobs(tx, m.date),
      await readRefreshReconciliations(tx, m.date), m.operation).length !== 0) {
      throw new Error("Refresh successor date budget consumed");
    }
    assertRefreshEqual(await readRefreshPrior(tx, m.date), m.prior, "successor prior");
    const { canonicalInputSha256, eligibleCount, ...database } = m.authority;
    void canonicalInputSha256; void eligibleCount;
    assertRefreshEqual(await captureRefreshDatabaseAuthority({ client: tx, date: m.date, clock }),
      database, "successor input");
    input.assertLocal(); assertRefreshManifest(m, clock.now());
    await tx.$queryRaw`
      insert into reader_summary_jobs (id, tenant_id, workspace_id, scope_type, scope_key,
        cadence, period_started_at, period_ended_at, period_timezone, period_key,
        status, idempotency_key, requested_at, updated_at)
      values (${job.id}::uuid, ${m.tenantId}::uuid, ${m.workspaceId}::uuid, 'workspace', 'workspace',
        'daily', ${m.startedAt}::timestamptz, ${m.endedAt}::timestamptz, 'UTC', ${job.period.periodKey},
        'REQUESTED', ${m.operation}, ${job.requestedAt}::timestamptz, ${job.requestedAt}::timestamptz)
    `;
    input.assertLocal(); assertRefreshManifest(m, clock.now());
  }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 30_000 }),
  { lock: (tx) => lockSuccessorAuthority(tx, m) });
}

/** Both connections hold SHARE locks during transfer. The admission snapshot
 * starts after holder acquisition, including any runtime tenant SELECTs. */
async function lockSuccessorAuthority(tx: PrismaReaderSummaryClient, m: RefreshManifest): Promise<void> {
  await lockRefreshAuthority(tx);
  if (!("$executeRaw" in tx) || typeof tx.$executeRaw !== "function") {
    throw new Error("Refresh successor requires transaction locks");
  }
  await tx.$executeRaw`lock table public.reader_summary_jobs, public.reader_summary_artifacts in share mode nowait`;
  const publications = await tx.$queryRaw<readonly { locked: boolean }[]>`
    select public.lock_reader_summary_refresh_publication_ledgers(
      ${m.tenantId}::uuid, ${m.workspaceId}::uuid, ${m.date}::date) as locked`;
  if (publications.length !== 1 || publications[0]?.locked !== true) {
    throw new Error("Refresh successor publication locks were not acquired");
  }
  const reconciliation = await tx.$queryRaw<readonly { locked: boolean }[]>`
    select public.lock_reader_summary_refresh_reconciliation(
      ${m.tenantId}::uuid, ${m.workspaceId}::uuid, ${m.date}::date) as locked`;
  if (reconciliation.length !== 1 || reconciliation[0]?.locked !== true) {
    throw new Error("Refresh successor reconciliation lock was not acquired");
  }
}
