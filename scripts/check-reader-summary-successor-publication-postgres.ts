/** Orchestrator-only native gate; separate fresh fixture from failed/no-chain gate. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { runWithTenantDatabaseAccess, resolvePostgresRuntimePoolConfig, getPostgresRuntimePoolDiagnostics } from "@social-monitor/platform-persistence";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { buildReaderSummaryPublicationRequestV2 } from "@social-monitor/summary/adapters/persistence/reader-summary-weekly-publication-evidence";
import { PrismaReaderSummaryGitHubProjectionReader } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-github-projection.reader";
import { readReviewedRefresh } from "./lib/reader-summary-new-input-refresh-files";
import { assertRefreshManifest } from "./lib/reader-summary-new-input-refresh-manifest";
import { refreshPeriod } from "./lib/reader-summary-new-input-refresh-capture";
import { assertRefreshSuccessorCurrent, consumeRefreshSuccessor } from "./lib/reader-summary-new-input-refresh-successor";
import { refreshPublicationGuard, assertRefreshTransactionAuthority } from "./lib/reader-summary-new-input-refresh-execution";
import { withRefreshPublicationLocks } from "./lib/reader-summary-new-input-refresh-publication-lock";
import { readRefreshJobs, readRefreshPrior, readRefreshCounts } from "./lib/reader-summary-new-input-refresh-postgres";
import { fixtureObserver, required, sqlState, assertUnlocked } from "./lib/reader-summary-successor-native-support";
import { fixtureDate, fixtureObservedThrough } from "./lib/reader-summary-successor-fixture-seed";
import { successorPublicationCommand } from "./lib/reader-summary-successor-publication-evidence";
import { publicationState, assertPublicationEffects } from "./lib/reader-summary-successor-publication-state";

async function main() {
  const m = readReviewedRefresh(required("READER_SUMMARY_REFRESH_TEST_MANIFEST_PATH"), required("READER_SUMMARY_REFRESH_TEST_MANIFEST_SHA256"));
  assert(m.successor, "exact prepared successor required");
  assert.equal(m.date, fixtureDate); assert.equal(m.observedThrough, fixtureObservedThrough);
  const clock = new FixedClock(new Date(m.preparedAt));
  const assertLocal = () => assertRefreshManifest(m, clock.now());
  assertLocal();
  const ids = { job: randomUUID(), artifact: randomUUID(), ready: randomUUID() };
  const requested = ReaderSummaryJob.request({ id: ids.job, tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
    scope: { type: "workspace" }, period: refreshPeriod(m.date), idempotencyKey: m.operation, requestedAt: clock.now() });
  const { observer, url } = await fixtureObserver();
  let summary: PrismaSummaryConnection | undefined;
  try {
    const observerIdentity = await observer.query<{ name: string }>("select current_user as name");
    assert.notEqual(observerIdentity.rows[0]?.name, new URL(url).username, "integrate attested separate observer plumbing first");
    await observer.query("select set_config('social_monitor.tenant_id',$1,false), set_config('social_monitor.workspace_id',$2,false), set_config('social_monitor.system_access','false',false)", [m.tenantId, m.workspaceId]);
    summary = await PrismaSummaryConnection.create(resolvePostgresRuntimePoolConfig({ DATABASE_URL: url,
      POSTGRES_RUNTIME_PROCESS: "daily-runner", POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" }));
    const db = summary;
    await runWithTenantDatabaseAccess(m, async () => {
      assert.deepEqual(getPostgresRuntimePoolDiagnostics(), { poolInstances: 1, prismaClientInstances: 1, activeConnectionLeases: 1, closing: false });
      const roles = await db.$queryRaw<readonly { rolsuper: boolean; rolbypassrls: boolean }[]>`
        select rolsuper, rolbypassrls from pg_roles where rolname=current_user`;
      assert.deepEqual(roles, [{ rolsuper: false, rolbypassrls: false }]);
      await assertRefreshSuccessorCurrent(db, m, clock.now());
      const jobs = await readRefreshJobs(db, m.date);
      assert.equal(jobs.length, 1, "fresh independently prepared fixture required; never reset an operation");
      assert.equal(jobs[0]?.jobId, m.successor!.originalJobId);
      const github = await new PrismaReaderSummaryGitHubProjectionReader(db).read({
        tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
        dayStartedAt: requested.toSnapshot().period.startedAt, dayEndedAt: requested.toSnapshot().period.endedAt,
        observedThrough: new Date(m.observedThrough) });
      // Validate the accepted producer seam before irrevocably consuming this fixture grant.
      buildReaderSummaryPublicationRequestV2(successorPublicationCommand(requested.start({ startedAt: clock.now() }), ids.artifact, ids.ready, github));
      const before = await publicationState(db, m), counts = await readRefreshCounts(db, m.date);
      assert.deepEqual(await readRefreshPrior(db, m.date), m.prior);
      const consume = () => consumeRefreshSuccessor({ summary: db, manifest: m, job: requested, clock, assertLocal });
      await consume();
      const repo = new PrismaReaderSummaryJobRepository(db);
      const query = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId), readerSummaryJobId: ids.job };
      const admitted = await repo.findById(query);
      assert(admitted); assert.equal(admitted.toSnapshot().status, "requested");
      assert.equal(admitted.toSnapshot().idempotencyKey, m.operation);
      const running = await repo.claimForExecution({ ...query, requestedAt: clock.now(), startedAt: clock.now(), staleRunningStartedBefore: new Date(0) });
      assert(running); assert.equal(running.toSnapshot().status, "running");
      const command = successorPublicationCommand(running, ids.artifact, ids.ready, github);
      await new PrismaReaderSummaryArtifactRepository(db).save(command.artifact, {
        publicationDecision: command.publicationDecision, githubProjectionAudit: command.githubProjectionAudit });
      const candidate = await publicationState(db, m);
      assert.equal(candidate.reader_summary_artifacts.find(r => r.id === ids.artifact)?.status, "RUNNING");
      const publish = () => withRefreshPublicationLocks(db, assertProtected =>
        new PrismaReaderSummaryPublication(db, refreshPublicationGuard({ assertLocal, assertProtected,
          assertCurrent: tx => assertRefreshTransactionAuthority(tx, m, ids.job, clock), manifest: m, jobId: ids.job })).publish(command));
      assert.equal(await publish(), "published");
      const after = await publicationState(db, m);
      const ready = assertPublicationEffects(before, after, m, ids, clock.now().toISOString());
      const current = await readRefreshPrior(db, m.date);
      assert.equal(current.publicationId, ids.artifact); assert.equal(current.jobId, ids.job);
      assert.equal(current.observedThrough, m.observedThrough); assert.equal(current.status, "COMPLETED");
      assert.equal(current.topCount, 1); assert.equal(current.additionalCount, 10); assert.equal(current.citationCount, 11);
      assert.deepEqual(await readRefreshPrior(db, m.date, m.prior.publicationId), m.prior);
      const afterCounts = await readRefreshCounts(db, m.date);
      for (const key of ["jobs", "artifacts", "publications", "outbox"] as const) assert.equal(afterCounts[key], counts[key] + 1);
      // Ordinary guard refuses terminal jobs before publisher SQL. Only this exact refusal is accepted.
      await assert.rejects(publish(), { message: "Refresh transaction lost consumed job authority" });
      await assert.rejects(consume(), { message: "Refresh successor date budget consumed" });
      assert.deepEqual(await publicationState(db, m), after);
      await assertUnlocked(observer);
      console.log(JSON.stringify({ status: "passed", engine: "native-postgresql", maxPool: 2, operation: m.operation,
        ids: { job: ids.job, artifact: ids.artifact, ready }, countsBefore: counts, countsAfter: afterCounts, providerCalls: 0, publication: "promotion-v2" }));
    });
  } finally { await summary?.close(); await observer.end(); }
}
if (require.main === module) void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", code: sqlState(error),
    reason: "successor_publication_check_failed",
    frames: error instanceof Error ? error.stack?.split("\n").slice(1, 8) : [] }));
  process.exitCode = 1;
});
