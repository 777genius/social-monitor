/** Parent-only native gate: a migrated disposable fixture, never a server,
 * provider, model, or production connection. Uses the actual Prisma publisher. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runWithTenantDatabaseAccess, resolvePostgresRuntimePoolConfig, getPostgresRuntimePoolDiagnostics } from "@social-monitor/platform-persistence";
import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import { PrismaReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { normalizeReaderSummaryArtifactPayload } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-payload";
import { buildReaderSummaryPublicationPayload, type ReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { ReaderSummaryArtifact } from "@social-monitor/summary/domain";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import { SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { refreshScope, assertRefreshManifest, refreshBytesHash } from "./lib/reader-summary-new-input-refresh-manifest";
import { readRefreshPrior, readRefreshJobs, readRefreshCounts } from "./lib/reader-summary-new-input-refresh-postgres";
import { assertRefreshEqual, reconcileRefresh } from "./lib/reader-summary-new-input-refresh-guard";
import { captureRefreshAuthority, preflightRefreshSelection, assertRefreshHasNewInput } from "./lib/reader-summary-new-input-refresh-capture";
import { assertRefreshTransactionAuthority } from "./lib/reader-summary-new-input-refresh-execution";
import { runRefreshNativeConcurrency } from "./lib/reader-summary-new-input-refresh-native-concurrency";
import { readReviewedRefresh } from "./lib/reader-summary-new-input-refresh-files";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; this native gate never skips`);
  return value;
};
async function main() {
  Error.stackTraceLimit = 20;
  const url = required("READER_SUMMARY_REFRESH_TEST_DATABASE_URL");
  assert.match(decodeURIComponent(new URL(url).pathname.slice(1)), /^reader_summary_refresh_test_[a-z0-9]+$/u);
  const m = readReviewedRefresh(required("READER_SUMMARY_REFRESH_TEST_MANIFEST_PATH"),
    required("READER_SUMMARY_REFRESH_TEST_MANIFEST_SHA256"));
  const clock = new SystemClock();
  assertRefreshManifest(m, clock.now());
  const bytes = readFileSync(required("READER_SUMMARY_REFRESH_TEST_CANDIDATE_PATH"));
  assert.equal(refreshBytesHash(bytes), required("READER_SUMMARY_REFRESH_TEST_CANDIDATE_SHA256"));
  const candidate = JSON.parse(bytes.toString("utf8")) as ReaderSummaryPublicationPayload;
  assert.equal(candidate.tenantId, refreshScope.tenantId);
  assert.equal(candidate.workspaceId, refreshScope.workspaceId);
  assert.equal(candidate.periodStartedAt, m.startedAt);
  assert.equal(candidate.modelVersion, "codex:gpt-5.6-sol:high");
  assert(candidate.requestedAt >= m.observedThrough && candidate.requestedAt <= clock.now().toISOString());
  assert.notEqual(candidate.requestedUtcDate, m.date, "fixture must use a historical content date and a real operation date");
  const config = resolvePostgresRuntimePoolConfig({ DATABASE_URL: url, POSTGRES_RUNTIME_PROCESS: "daily-runner",
    POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" });
  const summary = await PrismaSummaryConnection.create(config);
  const feedConnection = await PrismaFeedConnection.create(config);
  const feed = new PrismaFeedItemReadRepository(feedConnection);
  try {
    await runWithTenantDatabaseAccess(refreshScope, async () => {
      assert.deepEqual(getPostgresRuntimePoolDiagnostics(), {
        poolInstances: 1, prismaClientInstances: 1, activeConnectionLeases: 2, closing: false,
      });
      const before = await readRefreshPrior(summary, m.date);
      assertRefreshEqual(before, m.prior, "fixture prior");
      await assertRefreshHasNewInput(summary, m.date, before.observedThrough, m.observedThrough);
      assertRefreshEqual(await captureRefreshAuthority({ client: summary, feed, date: m.date,
        observedThrough: new Date(m.observedThrough), clock }), m.authority, "fixture full current input");
      const originalSelection = await preflightRefreshSelection({ feed, date: m.date, clock, observedThrough: new Date(before.observedThrough) });
      const newSelection = await preflightRefreshSelection({ feed, date: m.date, clock, observedThrough: new Date(m.observedThrough) });
      if (before.status === "NO_SIGNAL") assert.equal(originalSelection, 0, "original cutoff has no eligible metric authority");
      assert(newSelection > 0, "new cutoff selects current full canonical inputs");
      const command = await fixtureCommand(summary, candidate);
      assertRefreshEqual(buildReaderSummaryPublicationPayload(command), candidate, "normal Prisma command roundtrip");
      assert.throws(() => reconcileRefresh(m, [{ operation: m.operation, jobId: candidate.readerSummaryJobId,
        artifactId: null, status: "RUNNING" }], before), /consumed/);
      const current = (tx: PrismaReaderSummaryClient) => assertRefreshTransactionAuthority(tx, m, candidate.readerSummaryJobId, clock);
      for (const mutation of ["engagement", "config", "slot", "input"] as const) {
        await assert.rejects(summary.$transaction(async (tx) => {
          await mutateFixture(tx, mutation, m.date);
          await current(tx);
        }, { isolationLevel: "Serializable" }), /drifted|canonical prior/);
      }
      const countsBefore = await readRefreshCounts(summary, m.date);
      // The normal execution use case stages the RUNNING artifact before its
      // publisher. Include that real repository write in the measured delta.
      await new PrismaReaderSummaryArtifactRepository(summary).save(command.artifact, {
        publicationDecision: command.publicationDecision,
        githubProjectionAudit: command.githubProjectionAudit,
      });
      const { publicationMs, writerConflicts, acquisitionMs } = await runRefreshNativeConcurrency({
        url, summary, manifest: m, command, clock,
      });
      const after = await readRefreshPrior(summary, m.date);
      assert.equal(after.status, "COMPLETED");
      assert.equal(after.observedThrough, m.observedThrough);
      assert.notEqual(after.publicationId, before.publicationId);
      assertRefreshEqual(await readRefreshPrior(summary, m.date, before.publicationId), before, "immutable prior report/proof/job");
      assert.equal(reconcileRefresh(m, await readRefreshJobs(summary, m.date), after), "published");
      const countsAfter = await readRefreshCounts(summary, m.date);
      for (const key of ["publications", "outbox", "artifacts"] as const) assert.equal(countsAfter[key] - countsBefore[key], 1);
      assert.equal(countsAfter.jobs, countsBefore.jobs, "fixture already owns the one consumed job");
      assert.equal((await readRefreshJobs(summary, m.date)).length, 1);
      assert.equal(await new PrismaReaderSummaryPublication(summary).publish(command), "replayed");
      assertRefreshEqual(await readRefreshCounts(summary, m.date), countsAfter, "replay zero delta");
      console.log(JSON.stringify({ status: "passed", date: m.date, priorStatus: before.status,
        originalSelection, newSelection, before, after, countsBefore, countsAfter, publicationMs, writerConflicts, acquisitionMs,
        scenarios: ["actual-cutoff", "changed-input", "engagement-config-slot-input-drift", "independent-writer-commit-before-validation",
          "writer-blocked-after-publication-snapshot", "all-relation-orders-nowait",
          "consumed-no-repeat", "normal-prisma-publisher-max2", "preserved-original", "replay-zero-delta"] }));
    });
  } finally { await feedConnection.close(); await summary.close(); }
}
async function fixtureCommand(summary: PrismaSummaryConnection, p: ReaderSummaryPublicationPayload): Promise<ReaderSummaryPublicationCommand> {
  const job = await new PrismaReaderSummaryJobRepository(summary).findById({ tenantId: tenantId(p.tenantId),
    workspaceId: workspaceId(p.workspaceId), readerSummaryJobId: p.readerSummaryJobId });
  assert(job !== null && job.toSnapshot().status === "running");
  const artifact = ReaderSummaryArtifact.rehydrate(normalizeReaderSummaryArtifactPayload(p.report.artifactPayload, {
    id: p.readerSummaryArtifactId, tenantId: p.tenantId, workspaceId: p.workspaceId, scopeType: "workspace",
    interestId: null, cadence: "daily", periodStartedAt: new Date(p.periodStartedAt), periodEndedAt: new Date(p.periodEndedAt),
    periodTimezone: "UTC", userId: null, subscriptionId: null, headline: String(p.report.headline),
    summaryText: String(p.report.summaryText), createdAt: new Date(p.publishedAt),
  }));
  const generatedAt = artifact.toSnapshot().generatedAt;
  assert(generatedAt !== undefined && generatedAt >= job.toSnapshot().requestedAt);
  const quality = p.report.qualitySignals as Record<string, unknown>;
  return { artifact, finalJob: job.complete({ completedAt: new Date(p.publishedAt), readerSummaryId: p.readerSummaryArtifactId }),
    publicationDecision: quality.publicationDecision as ReaderSummaryPublicationCommand["publicationDecision"],
    githubProjectionAudit: quality.githubProjectionAudit as ReaderSummaryPublicationCommand["githubProjectionAudit"],
    readyEvent: p.readyEvent as unknown as ReaderSummaryPublicationCommand["readyEvent"] };
}
async function mutateFixture(tx: PrismaReaderSummaryClient, kind: "engagement" | "config" | "slot" | "input", date: string) {
  // Fixed SQL, fixture only, always rolled back by the rejected guard.
  const db = tx as PrismaReaderSummaryClient & { $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> };
  const count = kind === "engagement" ? await db.$executeRaw`update source_item_engagement_snapshots
    set last_observed_at = last_observed_at + interval '1 millisecond'
    where tenant_id=${refreshScope.tenantId}::uuid and workspace_id=${refreshScope.workspaceId}::uuid`
    : kind === "config" ? await db.$executeRaw`update reader_summary_policies set tone = case when tone='analytical' then 'neutral' else 'analytical' end
      where tenant_id=${refreshScope.tenantId}::uuid and workspace_id=${refreshScope.workspaceId}::uuid and scope_key='workspace'`
    : kind === "slot" ? await mutateFixtureSlot(db, date)
    : await db.$executeRaw`update feed_items set title=title || ' fixture drift'
      where tenant_id=${refreshScope.tenantId}::uuid and workspace_id=${refreshScope.workspaceId}::uuid
        and published_at >= ${date}::date::timestamp at time zone 'UTC'
        and published_at < (${date}::date + 1)::timestamp at time zone 'UTC'`;
  assert(count > 0, `fixture must exercise ${kind}`);
}

async function mutateFixtureSlot(
  db: PrismaReaderSummaryClient & { $executeRaw(s: TemplateStringsArray, ...v: unknown[]): Promise<number> },
  date: string,
): Promise<number> {
  // The production trigger permits only the publication owner. The disposable
  // fixture grants SET on its own random owner; no production role is changed.
  const roles = await db.$queryRaw<readonly { runtime_role: string; owner_role: string }[]>`
    select current_user as runtime_role, pg_catalog.pg_get_userbyid(c.relowner) as owner_role
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reader_summary_publication_slots'`;
  assert.equal(roles.length, 1, "fixture slot owner must be unambiguous");
  const role = roles[0]!;
  assert.notEqual(role.runtime_role, role.owner_role, "guard must execute as fixture runtime");
  await db.$queryRaw`select pg_catalog.set_config('role', ${role.owner_role}, true)`;
  const count = await db.$executeRaw`update reader_summary_publication_slots set current_publication_id=null
    where tenant_id=${refreshScope.tenantId}::uuid and workspace_id=${refreshScope.workspaceId}::uuid
      and period_started_at=${date}::date::timestamp at time zone 'UTC'`;
  // Restore before the authority guard. SQL errors abort/roll back the whole
  // fixture transaction and are never accepted as a successful drift check.
  await db.$queryRaw`select pg_catalog.set_config('role', ${role.runtime_role}, true)`;
  return count;
}
if (require.main === module) void main().catch((error: unknown) => {
  // Keep only source locations, never database errors, SQL or candidate payloads.
  const frames = error instanceof Error ? error.stack?.split("\n").slice(1)
    .filter((line) => /^\s+at /.test(line)).slice(0, 16) : [];
  const value = error as { code?: unknown; meta?: { code?: unknown;
    driverAdapterError?: { cause?: { originalCode?: unknown; originalMessage?: unknown } } } };
  const safeCode = (code: unknown) => typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : undefined;
  const message = String(value?.meta?.driverAdapterError?.cause?.originalMessage ?? "");
  const categories = ["permission denied", "serialize", "timeout", "immutable", "publication",
    "current", "slot", "tenant", "scope", "artifact", "constraint"].filter((word) => message.includes(word));
  console.error(JSON.stringify({ status: "failed", code: safeCode(value?.code),
    sqlState: safeCode(value?.meta?.code ?? value?.meta?.driverAdapterError?.cause?.originalCode), categories, frames }));
  process.exitCode = 1;
});
