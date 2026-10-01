import { randomUUID } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import { runSerializableReaderSummaryTransaction } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import { readerSummaryFirstPublicationPrefix } from "@social-monitor/summary/application/contracts/reader-summary-first-publication-authority";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";
import { captureFirstPublicationInventory, readFirstPublicationObservationScope } from "./reader-summary-first-publication-inventory";
import { ReaderSummaryDayDatasetGuard } from "./reader-summary-day-dataset-guard";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { createFirstPublicationPg18Fixture, nativeFirstpubPrismaClient, pg18FixtureScope } from "./reader-summary-first-publication-pg18.spec-support";
import { installFirstpubSnapshotDiagnostics } from "./reader-summary-first-publication-pg18-snapshot.spec-support";
import { proveNativeFirstpubClaimMatrix } from "./reader-summary-first-publication-pg18-claims.spec-support";
import { proveNativeFirstpubProcessCrash } from "./reader-summary-first-publication-pg18-crash.spec-support";

const start = new Date("2026-09-29T00:00:00.000Z"), end = new Date("2026-09-30T00:00:00.000Z");
const day = { ...pg18FixtureScope, startedAt: start.toISOString(), endedAt: end.toISOString() };

// This gate is deliberately separate from deterministic producer tests. A
// missing native binary is a failed required proof, never a skipped green test.
it("native disposable PG18 proves finite ACL, durable reservation and the full firstpub publication callback", async () => {
  const f = await createFirstPublicationPg18Fixture();
  const params = [day.tenantId, day.workspaceId, start, end];
  const session = await f.finite.connect().catch(async (error: unknown) => {
    try { await f.stop(); }
    catch (shutdownError) { throw new AggregateError([error, shutdownError], `Own PG18 connection failed; retained ${f.root}`); }
    throw error;
  });
  const context = () => session.query(`SELECT set_config('social_monitor.tenant_id',$1,false),
    set_config('social_monitor.workspace_id',$2,false),set_config('social_monitor.system_access','false',false)`, params.slice(0, 2));
  const directInsert = `INSERT INTO reader_summary_publication_slots
    (tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,period_ended_at,period_timezone,updated_at)
    VALUES($1,$2,'workspace','workspace','daily',$3,$4,'UTC',clock_timestamp())`;
  const reserve = () => reserveFirstPublicationDay(f.client, day, new Date());
  try {
    expect((await f.admin.query("SHOW server_version_num")).rows[0].server_version_num).toMatch(/^18\d{4}$/u);
    await context();
    // OLD RED: observed production privilege failures, using the same finite
    // role and real PostgreSQL permission checks (not a SQL dispatcher).
    for (const [sql, values] of [
      [directInsert, params], ["LOCK TABLE reader_summary_jobs IN EXCLUSIVE MODE NOWAIT", []],
      ["LOCK TABLE feed_items IN SHARE MODE NOWAIT", []], ["SELECT * FROM tenants", []],
      ["SELECT * FROM source_item_engagement_snapshots", []],
    ] as const) {
      await session.query("BEGIN");
      await expect(session.query(sql, [...values])).rejects.toMatchObject({ code: "42501" });
      await session.query("ROLLBACK");
    }
    await f.admin.query("GRANT INSERT ON reader_summary_publication_slots TO social_monitor_summary_once");
    await expect(session.query(directInsert, params)).rejects.toMatchObject({ code: "P0001" });
    await f.admin.query("REVOKE INSERT ON reader_summary_publication_slots FROM social_monitor_summary_once");
    await f.installContract();
    await installFirstpubSnapshotDiagnostics(f.admin);
    await proveNativeFirstpubClaimMatrix(f.withClaimCase);
    await f.withClaimCase("slots_unknown", proveNativeFirstpubProcessCrash);
    // NEW GREEN may expose only counts/digest and bounded EXECUTE. Direct
    // protected writes and private parent/engagement SELECT remain forbidden.
    await expect(session.query(directInsert, params)).rejects.toMatchObject({ code: "42501" });
    await expect(session.query("UPDATE reader_summary_publication_slots SET updated_at = clock_timestamp()")).rejects.toMatchObject({ code: "42501" });
    await expect(session.query("SELECT * FROM tenants")).rejects.toMatchObject({ code: "42501" });
    await expect(session.query("SELECT * FROM source_item_engagement_observations")).rejects.toMatchObject({ code: "42501" });
    await expect(session.query("SET ROLE social_monitor_reader_summary_publication_owner")).rejects.toMatchObject({ code: "42501" });
    const call = `SELECT public.reserve_reader_summary_first_publication($1,$2,$3,$4,$5)`;
    await expect(session.query(call, [...params, new Date(Date.now() + 60_000)])).rejects.toMatchObject({ code: "42501" });
    await expect(session.query(call, [...params, new Date(Date.now() - 1801_000)])).rejects.toMatchObject({ code: "P0001" });
    await expect(session.query(call, [randomUUID(), day.workspaceId, start, end, new Date()])).rejects.toMatchObject({ code: "42501" });
    await expect(session.query(call, [day.tenantId, randomUUID(), start, end, new Date()])).rejects.toMatchObject({ code: "42501" });
    await expect(session.query(call, [day.tenantId, day.workspaceId, end, new Date(end.getTime() + 86400_000), new Date()])).rejects.toMatchObject({ code: "42501" });
    await session.query("RESET social_monitor.tenant_id; RESET social_monitor.workspace_id");
    await expect(session.query(call, [...params, new Date()])).rejects.toMatchObject({ code: "42501" });
    await context();
    await f.admin.query("UPDATE workspaces SET deleted_at = clock_timestamp() WHERE id=$1", [day.workspaceId]);
    await expect(reserve()).rejects.toMatchObject({ code: "P0001" });
    await f.admin.query("UPDATE workspaces SET deleted_at = NULL WHERE id=$1", [day.workspaceId]);

    // Concrete reservation schedule: middleware has executed its SELECT;
    // an ordinary non-cooperating writer then commits a failed job before
    // reservation locks. The function must see it, not the old snapshot.
    const failedId = randomUUID();
    const commitFailedJob = async () => {
      const ordinaryWriter = await f.finite.connect();
      try {
        await ordinaryWriter.query(`SELECT set_config('social_monitor.tenant_id',$1,false),
          set_config('social_monitor.workspace_id',$2,false),set_config('social_monitor.system_access','false',false)`, params.slice(0, 2));
        await ordinaryWriter.query(`INSERT INTO reader_summary_jobs(id,tenant_id,workspace_id,scope_type,scope_key,cadence,
          period_started_at,period_ended_at,period_timezone,period_key,status,idempotency_key,requested_at,created_at,updated_at)
          VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,'FAILED',$1::text,$5,$5,$5)`,
        [failedId, day.tenantId, day.workspaceId, start, end, buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: start, endedAt: end }).periodKey]);
      } finally { ordinaryWriter.release(); }
    };
    const reservationClient = nativeFirstpubPrismaClient(f.finite, { afterTenantContext: commitFailedJob });
    // OLD snapshot predicate behind a trusted lock function still misses the
    // committed claim. This diagnostic does not insert or call a provider.
    await expect(runWithTenantDatabaseAccess(day, () => runSerializableReaderSummaryTransaction(
      reservationClient, async (tx) => {
        const rows = await tx.$queryRaw<readonly { absent: boolean }[]>`
          SELECT firstpub_snapshot_probe.claim_absent() AS absent`;
        expect(rows).toEqual([{ absent: true }]);
        throw new Error("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_CLAIM");
      }))).rejects.toThrow("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_CLAIM");
    expect(Number((await f.admin.query("SELECT count(*) FROM reader_summary_jobs WHERE id=$1", [failedId])).rows[0].count)).toBe(1);
    await f.admin.query("DELETE FROM reader_summary_jobs WHERE id=$1", [failedId]);
    // NEW executes the complete reservation callback, including the actual
    // middleware SELECT before the intervening commit; the error propagates.
    await expect(reserveFirstPublicationDay(reservationClient, day, new Date())).rejects.toMatchObject({ code: "P0001" });
    await f.admin.query("DELETE FROM reader_summary_jobs WHERE id=$1", [failedId]);
    // Catching a statement failure must not make COMMIT's ROLLBACK response
    // look like a durable successful callback in the native Prisma bridge.
    await expect(runWithTenantDatabaseAccess(day, () => f.client.$transaction(async (tx) => {
      await expect(tx.$queryRaw`SELECT 1 / 0`).rejects.toMatchObject({ code: "22012" });
      return "must not commit";
    }))).rejects.toThrow("did not commit");
    const writer = await f.finite.connect();
    try {
      await writer.query("BEGIN; LOCK TABLE reader_summary_jobs IN ROW EXCLUSIVE MODE");
      await expect(reserve()).rejects.toMatchObject({ code: "55P03" });
    } finally {
      try { await writer.query("ROLLBACK"); }
      finally { writer.release(); }
    }
    const attempts = await Promise.allSettled([reserve(), reserve()]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await f.admin.query("SELECT count(*) FROM reader_summary_publication_slots")).rows[0].count)).toBe(1);
    // Committed null slot survives a wholly new connection. Process-crash
    // durability is a separate required scenario, not implied by this check.
    const reconnect = await f.finite.connect();
    try {
      await reconnect.query(`SELECT set_config('social_monitor.tenant_id',$1,false),set_config('social_monitor.workspace_id',$2,false)`, params.slice(0, 2));
      await expect(reconnect.query(call, [...params, new Date()])).rejects.toMatchObject({ code: "P0001" });
    } finally { reconnect.release(); }

    // Seed exactly 422 synthetic published-day rows, including 24 observed on
    // Sep30. All creation/update times precede fixed A; no provider is invoked.
    const interest = randomUUID(), catalog = randomUUID(), binding = randomUUID();
    await f.admin.query(`INSERT INTO interests(id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
      VALUES($1,$2,$3,'synthetic inventory','synthetic','ENABLED',$4,$4)`, [interest, day.tenantId, day.workspaceId, start]);
    await f.admin.query(`INSERT INTO source_catalog_entries(id,provider_key,display_name,acquisition_mode,readiness,created_at,updated_at)
      VALUES($1,'rss','synthetic','pull','ready',$2,$2)`, [catalog, start]);
    await f.admin.query(`INSERT INTO source_bindings(id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,
      capability_profile_version,status,config,created_at,updated_at) VALUES($1,$2,$3,$4,$5,1,'ENABLED','{}',$6,$6)`, [binding, day.tenantId, day.workspaceId, interest, catalog, start]);
    for (let i = 0; i < 422; i++) {
      const source = randomUUID(), feed = randomUUID(), observed = new Date((i < 398 ? start : end).getTime() + 1000);
      await f.admin.query(`INSERT INTO source_items(id,tenant_id,workspace_id,source_binding_id,provider_key,provider_item_id,
        canonical_url,title,body,published_at,content_hash,observed_at,metadata)
        VALUES($1,$2,$3,$4,'rss',$1::text,'synthetic:'||$1::text,'synthetic','synthetic',$5,$6,$7,'{}')`, [source, day.tenantId, day.workspaceId, binding, start, "a".repeat(64), observed]);
      await f.admin.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,
        provider_key,dedupe_key,canonical_url,title,body_preview,published_at,observed_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'rss',$1::text,'synthetic:'||$5::text,'synthetic','synthetic',$7,$8,$8)`, [feed, day.tenantId, day.workspaceId, interest, source, binding, start, observed]);
    }
    const asOf = new Date();
    const inventory = await captureFirstPublicationInventory({ client: f.client, ...pg18FixtureScope,
      startedAt: start, endedAt: end, generatedAt: asOf });
    expect(inventory.datasetManifest.dataset.feedRowCount).toBe(422);
    expect(inventory.coverage).toBe("UNPROVEN");
    expect(await readFirstPublicationObservationScope(f.client, inventory.datasetManifest)).toBe(inventory.observationScopeSha256);
    const makeGuard = async () => {
      const guard = new ReaderSummaryDayDatasetGuard(f.client, inventory.datasetManifest, "a".repeat(64), () => new Date(), undefined, inventory);
      await guard.assertCurrent("before_evidence_selection");
      await guard.assertCurrent("after_evidence_selection"); return guard;
    };
    // A mismatched canonical join may never be hidden by an inner join or
    // by shrinking the expected inventory to the 398 in-day observations.
    await f.admin.query("UPDATE feed_items SET canonical_url='synthetic:missing-join' WHERE id=(SELECT id FROM feed_items LIMIT 1)");
    await expect(readFirstPublicationObservationScope(f.client, inventory.datasetManifest)).rejects.toThrow("canonical join");
    await f.admin.query("UPDATE feed_items f SET canonical_url=s.canonical_url FROM source_items s WHERE s.id=f.source_item_id");
    await f.admin.query("UPDATE source_bindings SET deleted_at=clock_timestamp() WHERE id=$1", [binding]);
    await expect(readFirstPublicationObservationScope(f.client, inventory.datasetManifest)).rejects.toThrow("canonical join");
    await f.admin.query("UPDATE source_bindings SET deleted_at=NULL WHERE id=$1", [binding]);
    const guard = await makeGuard();
    await runWithTenantDatabaseAccess(day, () => f.client.$transaction(async (tx) => {
      await guard.assertCurrentForPublicationTransaction(tx);
      const competitor = await f.admin.connect();
      try {
        await competitor.query("SET lock_timeout='50ms'");
        await expect(competitor.query("UPDATE source_items SET body='changed'")).rejects.toMatchObject({ code: "55P03" });
      } finally { competitor.release(); }
    }, { isolationLevel: "ReadCommitted" }));

    // Actual publication adapter callback, including real tenant middleware,
    // real deadline, full manifest/digest guard, then real DB publisher/CAS.
    const seed = await f.admin.connect();
    const fixture = await (async () => {
      try { return await createReaderSummaryPublicationRunningFixture(seed, "NO_SIGNAL", "2026-09-29", { providerEvidence: "none" }); }
      finally { seed.release(); }
    })();
    const idempotencyKey = `${readerSummaryFirstPublicationPrefix}${day.workspaceId}:2026-09-29`;
    await f.admin.query("UPDATE reader_summary_jobs SET idempotency_key=$1 WHERE id=$2", [idempotencyKey, fixture.jobId]);
    const finalJob = ReaderSummaryJob.rehydrate({ id: fixture.jobId, tenantId: tenantId(day.tenantId), workspaceId: workspaceId(day.workspaceId),
      scope: { type: "workspace" }, period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: start, endedAt: end }),
      status: "completed", idempotencyKey, requestedAt: new Date(), startedAt: new Date(), completedAt: new Date(), readerSummaryId: fixture.artifactId });
    const command = { finalJob } as ReaderSummaryPublicationCommand; // Daily v2 locates the persisted fixture; it reads no caller artifact bytes.
    const commitDatasetChange = async () => {
      await f.admin.query("UPDATE source_items SET body='intervening committed change' WHERE id=(SELECT id FROM source_items LIMIT 1)");
    };
    const publicationClient = nativeFirstpubPrismaClient(f.finite, { afterDeadline: commitDatasetChange });
    // OLD full adapter order: real middleware, real deadline, trusted lock,
    // then the same manifest/digest validation sees its stale snapshot. Abort
    // deliberately before the publisher; no stale publication is produced.
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      publicationClient, async (tx) => {
        await tx.$queryRaw`SELECT firstpub_snapshot_probe.lock_dataset()`;
        const staleGuard = new ReaderSummaryDayDatasetGuard(tx, inventory.datasetManifest, "a".repeat(64), () => new Date(), undefined, inventory);
        await staleGuard.assertCurrent("before_evidence_selection");
        await staleGuard.assertCurrent("after_evidence_selection");
        await staleGuard.assertCurrent("before_publication");
        throw new Error("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_DATASET_CHANGE");
      }).publish(command))).rejects.toThrow("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_DATASET_CHANGE");
    expect(await readFirstPublicationObservationScope(f.client, inventory.datasetManifest)).not.toBe(inventory.observationScopeSha256);
    await f.admin.query("UPDATE source_items SET body='synthetic'");
    const publicationGuard = await makeGuard();
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      publicationClient, (tx) => publicationGuard.assertCurrentForPublicationTransaction(tx), "first_publication_sep29").publish(command))).rejects.toThrow("changed");
    expect((await f.admin.query("SELECT current_publication_id FROM reader_summary_publication_slots")).rows[0].current_publication_id).toBeNull();
    await f.admin.query("UPDATE source_items SET body='synthetic'");
    const finalGuard = await makeGuard();
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      f.client, (tx) => finalGuard.assertCurrentForPublicationTransaction(tx), "first_publication_sep29").publish(command))).resolves.toBe("published");
    expect((await f.admin.query("SELECT current_publication_id FROM reader_summary_publication_slots")).rows[0].current_publication_id).toBe(fixture.artifactId);
    await expect(reserve()).rejects.toMatchObject({ code: "P0001" });
  } finally { session.release(); await f.stop(); }
}, 120_000);
