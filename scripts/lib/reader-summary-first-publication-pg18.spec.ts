import { randomUUID } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PrismaReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-publication";
import type { PrismaReaderSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-client";
import type { ReaderSummaryPublicationCommand } from "@social-monitor/summary/ports";
import { runSerializableReaderSummaryTransaction } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-transaction";
import { readerSummaryFirstPublicationPrefix } from "@social-monitor/summary/application/contracts/reader-summary-first-publication-authority";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";
import { captureFirstPublicationInventory, readFirstPublicationObservationScope } from "./reader-summary-first-publication-inventory";
import { ReaderSummaryDayDatasetGuard } from "./reader-summary-day-dataset-guard";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { createFirstPublicationPg18Fixture, proveNativeFirstpubPrismaClaimMatrix, pg18FixtureScope } from "./reader-summary-first-publication-pg18.spec-support";
import { installFirstpubSnapshotDiagnostics } from "./reader-summary-first-publication-pg18-snapshot.spec-support";
import { expectFirstpubPrismaSqlState, type NativeFirstpubPrismaConnection } from "./reader-summary-first-publication-pg18-prisma.spec-support";
import { proveNativeFirstpubProcessCrash } from "./reader-summary-first-publication-pg18-crash.spec-support";

const start = new Date("2026-09-29T00:00:00.000Z"), end = new Date("2026-09-30T00:00:00.000Z");
const day = { ...pg18FixtureScope, startedAt: start.toISOString(), endedAt: end.toISOString() };

// This gate is deliberately separate from deterministic producer tests. A
// missing native binary is a failed required proof, never a skipped green test.
it("native disposable PG18 proves finite ACL, durable reservation and the full firstpub publication callback", async () => {
  const f = await createFirstPublicationPg18Fixture();
  let client: NativeFirstpubPrismaConnection;
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
  const reserve = () => reserveFirstPublicationDay(client, day, new Date());
  let operationError: unknown;
  let operationFailed = false;
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
    // This fresh empty clone must succeed, independently of the main schedule
    // and before any competing claim. Failed/unknown daily claims below must
    // yield P0001, never permission denied on the fifth ledger.
    await f.withClaimCase("jobs_unknown", async (empty) => {
      // C1 historically grants table SELECT to this owner. Preserve it in
      // the main DB. This clone's preparation revokes the legacy grant BEFORE
      // installing the contract: table REVOKE also removes column grants.
      // The committed contract must supply all three column grants itself.
      // Independent PostgreSQL privilege contract. Runtime SELECT cannot lend
      // the SECURITY DEFINER its missing fifth-ledger column privileges.
      const owner = "social_monitor_reader_summary_publication_owner";
      const ledger = "public.reader_summary_daily_model_jobs";
      expect((await empty.admin.query(`SELECT pg_catalog.has_table_privilege($1,$2,'SELECT') AS broad`,
        [owner, ledger])).rows).toEqual([{ broad: false }]);
      const columns = await empty.admin.query(`SELECT a.attname,
        pg_catalog.has_column_privilege($1,a.attrelid,a.attnum,'SELECT') AS readable
        FROM pg_catalog.pg_attribute a WHERE a.attrelid=$2::regclass
          AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [owner, ledger]);
      expect(columns.rows.filter((row) => row.readable).map((row) => row.attname).sort())
        .toEqual(["requested_utc_date", "tenant_id", "workspace_id"]);
      expect((await empty.admin.query(`SELECT c.relowner::regrole::text AS owner,c.relforcerowsecurity AS forced
        FROM pg_catalog.pg_class c WHERE c.oid=$1::regclass`, [ledger])).rows)
        .toEqual([{ owner: "social_monitor_public_schema_owner", forced: true }]);
      expect((await empty.admin.query(`SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_catalog.pg_roles
        WHERE rolname=$1`, [owner])).rows).toEqual([{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
      await expect(reserveFirstPublicationDay(empty.client, day, new Date())).resolves.toBeUndefined();
      expect((await empty.admin.query("SELECT current_publication_id FROM reader_summary_publication_slots")).rows)
        .toEqual([{ current_publication_id: null }]);
    }, async (auditor) => {
      await auditor.query("REVOKE SELECT ON public.reader_summary_daily_model_jobs FROM social_monitor_reader_summary_publication_owner");
    });
    // Real LOGIN attributes/memberships in the disposable cluster only. Direct
    // EXECUTE for the missing member isolates admission from function ACL denial.
    await f.admin.query(`CREATE ROLE firstpub_synthetic_bypass LOGIN NOSUPERUSER BYPASSRLS;
      CREATE ROLE firstpub_synthetic_super_member LOGIN SUPERUSER NOBYPASSRLS;
      CREATE ROLE firstpub_synthetic_missing LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE firstpub_synthetic_owner_set LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE firstpub_synthetic_schema_set LOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT social_monitor_summary_once TO firstpub_synthetic_bypass,firstpub_synthetic_super_member,firstpub_synthetic_owner_set,firstpub_synthetic_schema_set;
      GRANT social_monitor_reader_summary_publication_owner TO firstpub_synthetic_owner_set WITH INHERIT FALSE, SET TRUE;
      GRANT social_monitor_public_schema_owner TO firstpub_synthetic_schema_set WITH INHERIT FALSE, SET TRUE;
      GRANT USAGE ON SCHEMA public TO firstpub_synthetic_missing;
      GRANT EXECUTE ON FUNCTION public.observe_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz)
        TO firstpub_synthetic_missing`);
    const observe = `SELECT * FROM public.observe_reader_summary_first_publication($1,$2,$3,$4,$5)`;
    for (const user of ["finite", "bypass", "super_member", "missing", "owner_set", "schema_set"] as const) {
      const principal = await f.principal(`firstpub_synthetic_${user}`).connect();
      try {
        const identity = (await principal.query(`SELECT session_user::text AS name,r.rolsuper,r.rolbypassrls,
          pg_catalog.pg_has_role(session_user,'social_monitor_summary_once','USAGE') AS capable,
          pg_catalog.pg_has_role(session_user,'social_monitor_reader_summary_publication_owner','SET') AS owner_set,
          pg_catalog.pg_has_role(session_user,'social_monitor_public_schema_owner','SET') AS schema_set
          FROM pg_catalog.pg_roles r WHERE r.rolname=session_user`)).rows[0];
        expect(identity.name).toBe(`firstpub_synthetic_${user}`);
        expect(identity.rolsuper).toBe(user === "super_member");
        expect(identity.rolbypassrls).toBe(user === "bypass");
        expect(identity.capable).toBe(user !== "missing");
        expect(identity.owner_set).toBe(user === "owner_set" || user === "super_member");
        expect(identity.schema_set).toBe(user === "schema_set" || user === "super_member");
        await principal.query(`SELECT set_config('social_monitor.tenant_id',$1,false),
          set_config('social_monitor.workspace_id',$2,false),set_config('social_monitor.system_access','false',false)`, params.slice(0, 2));
        if (user === "finite") {
          expect((await principal.query(observe, [...params, new Date()])).rows).toHaveLength(1);
          for (const invalidTime of ["infinity", "-infinity", null]) {
            await expect(principal.query(observe, [...params, invalidTime])).rejects.toMatchObject({ code: "42501" });
          }
          await principal.query("SELECT set_config('social_monitor.system_access','true',false)");
          await expect(principal.query(observe, [...params, new Date()])).rejects.toMatchObject({ code: "42501" });
          await principal.query("SELECT set_config('social_monitor.system_access','false',false),set_config('social_monitor.workspace_id','',false)");
          await expect(principal.query(observe, [...params, new Date()])).rejects.toMatchObject({ code: "42501" });
        } else {
          await expect(principal.query(observe, [...params, new Date()])).rejects.toMatchObject({ code: "42501" });
        }
      } finally { principal.release(); }
    }
    // Real callback failure after a genuine reservation result must roll back
    // its null slot. Independent clone: no day reset or recovery of a claim.
    await f.withClaimCase("slots_failed", async (aborted) => {
      const failure = new Error("NATIVE_PRISMA_CALLBACK_REFUSAL");
      await expect(runWithTenantDatabaseAccess(day, () => aborted.client.$transaction(async (tx) => {
        const settings = await tx.$queryRaw<readonly { isolation: string; tenant: string; workspace: string; system: string; principal: string }[]>`
          SELECT current_setting('transaction_isolation') AS isolation,
            current_setting('social_monitor.tenant_id') AS tenant,
            current_setting('social_monitor.workspace_id') AS workspace,
            current_setting('social_monitor.system_access') AS system, session_user::text AS principal`;
        expect(settings).toEqual([{ isolation: "read committed", tenant: day.tenantId,
          workspace: day.workspaceId, system: "false", principal: "firstpub_synthetic_finite" }]);
        expect(() => aborted.client.$queryRaw`SELECT 1`).toThrow("Root Prisma client cannot be used");
        const rows = await tx.$queryRaw<readonly { reserved: boolean }[]>`
          SELECT public.reserve_reader_summary_first_publication(${day.tenantId}::uuid,
            ${day.workspaceId}::uuid, ${start}, ${end}, ${new Date()}) AS reserved`;
        expect(rows).toEqual([{ reserved: true }]);
        throw failure;
      }, { isolationLevel: "ReadCommitted", maxWait: 30_000, timeout: 30_000 }))).rejects.toBe(failure);
      expect((await aborted.admin.query("SELECT count(*)::integer AS slots FROM reader_summary_publication_slots")).rows)
        .toEqual([{ slots: 0 }]);
    });
    await installFirstpubSnapshotDiagnostics(f.admin);
    await proveNativeFirstpubPrismaClaimMatrix((name, operation) => f.withClaimCase(name, async (claim) => {
      await operation(claim);
      if (!name.startsWith("daily_model_jobs_")) return;
      // For both failed and UNKNOWN claims, execute the exact three-column
      // read as the inaccessible owner with FORCE RLS still enabled. Catalog
      // ACL booleans alone do not prove that this owner can read scoped rows.
      const ownerSession = await claim.admin.connect();
      try {
        await ownerSession.query("BEGIN; SET LOCAL ROLE social_monitor_reader_summary_publication_owner");
        await ownerSession.query(`SELECT set_config('social_monitor.tenant_id',$1,true),
          set_config('social_monitor.workspace_id',$2,true),set_config('social_monitor.system_access','false',true)`, params.slice(0, 2));
        const actual = await ownerSession.query(`SELECT tenant_id::text,workspace_id::text,requested_utc_date::text
          FROM public.reader_summary_daily_model_jobs WHERE tenant_id=$1 AND workspace_id=$2
            AND requested_utc_date=DATE '2026-09-29'`, params.slice(0, 2));
        expect(actual.rows).toEqual([{ tenant_id: day.tenantId, workspace_id: day.workspaceId, requested_utc_date: "2026-09-29" }]);
      } finally {
        try { await ownerSession.query("ROLLBACK"); } finally { ownerSession.release(); }
      }
    }));
    client = await f.openPrisma();
    expect(client).toBeInstanceOf(PrismaSummaryConnection);
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
    await expectFirstpubPrismaSqlState(reserve(), "P0001");
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
          VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,'FAILED',$1::uuid::text,$5,$5,$5)`,
        [failedId, day.tenantId, day.workspaceId, start, end, buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: start, endedAt: end }).periodKey]);
      } finally { ordinaryWriter.release(); }
    };
    const reservationClient = await f.openPrisma({ afterTenantContext: commitFailedJob });
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
    await expectFirstpubPrismaSqlState(reserveFirstPublicationDay(reservationClient, day, new Date()), "P0001");
    await f.admin.query("DELETE FROM reader_summary_jobs WHERE id=$1", [failedId]);
    // Retain the original swallowed-statement COMMIT invariant as a required
    // genuine-engine proof. Defer its assertion until the other schedules have
    // executed, so a Prisma acknowledgement of an aborted tx cannot hide them.
    // No extra query forces an abort and no fixture COMMIT/error is invented.
    let genuineStatementFailureObserved = false;
    const abortedTransactionOutcome = await Promise.allSettled([
      runWithTenantDatabaseAccess(day, () => client.$transaction(async (tx) => {
        await expectFirstpubPrismaSqlState(tx.$queryRaw`SELECT 1 / 0`, "22012");
        genuineStatementFailureObserved = true;
        return "must not commit";
      }, { isolationLevel: "ReadCommitted", maxWait: 30_000, timeout: 30_000 })),
    ]);
    const writer = await f.finite.connect();
    try {
      await writer.query("BEGIN; LOCK TABLE reader_summary_jobs IN ROW EXCLUSIVE MODE");
      await expectFirstpubPrismaSqlState(reserve(), "55P03");
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
        VALUES($1,$2,$3,$4,'rss',$1::uuid::text,'synthetic:'||$1::uuid::text,'synthetic','synthetic',$5,$6,$7,'{}')`, [source, day.tenantId, day.workspaceId, binding, start, "a".repeat(64), observed]);
      await f.admin.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,
        provider_key,dedupe_key,canonical_url,title,body_preview,published_at,observed_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'rss',$1::uuid::text,'synthetic:'||$5::uuid::text,'synthetic','synthetic',$7,$8,$8)`, [feed, day.tenantId, day.workspaceId, interest, source, binding, start, observed]);
    }
    const asOf = new Date();
    const inventory = await captureFirstPublicationInventory({ client, ...pg18FixtureScope,
      startedAt: start, endedAt: end, generatedAt: asOf });
    expect(inventory.datasetManifest.dataset.feedRowCount).toBe(422);
    expect(inventory.coverage).toBe("UNPROVEN");
    expect(await readFirstPublicationObservationScope(client, inventory.datasetManifest)).toBe(inventory.observationScopeSha256);
    const makeGuard = async () => {
      const guard = new ReaderSummaryDayDatasetGuard(client, inventory.datasetManifest, "a".repeat(64), () => new Date(), undefined, inventory);
      await guard.assertCurrent("before_evidence_selection");
      await guard.assertCurrent("after_evidence_selection"); return guard;
    };
    // A mismatched canonical join may never be hidden by an inner join or
    // by shrinking the expected inventory to the 398 in-day observations.
    await f.admin.query("UPDATE feed_items SET canonical_url='synthetic:missing-join' WHERE id=(SELECT id FROM feed_items LIMIT 1)");
    await expect(readFirstPublicationObservationScope(client, inventory.datasetManifest)).rejects.toThrow("canonical join");
    await f.admin.query("UPDATE feed_items f SET canonical_url=s.canonical_url FROM source_items s WHERE s.id=f.source_item_id");
    await f.admin.query("UPDATE source_bindings SET deleted_at=clock_timestamp() WHERE id=$1", [binding]);
    await expect(readFirstPublicationObservationScope(client, inventory.datasetManifest)).rejects.toThrow("canonical join");
    await f.admin.query("UPDATE source_bindings SET deleted_at=NULL WHERE id=$1", [binding]);
    const guard = await makeGuard();
    await runWithTenantDatabaseAccess(day, () => client.$transaction(async (tx) => {
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
    // Exercise an actual generated delegate as well as the real raw-query path.
    const persisted = await runWithTenantDatabaseAccess(day, () => client.readerSummaryJob.findFirst({
      where: { tenantId: day.tenantId, workspaceId: day.workspaceId, id: fixture.jobId },
    }));
    expect(persisted).toMatchObject({ id: fixture.jobId, tenantId: day.tenantId, workspaceId: day.workspaceId, status: "RUNNING" });
    expect(persisted?.requestedAt).toBeInstanceOf(Date);
    const idempotencyKey = `${readerSummaryFirstPublicationPrefix}${day.workspaceId}:2026-09-29`;
    await f.admin.query("UPDATE reader_summary_jobs SET idempotency_key=$1 WHERE id=$2", [idempotencyKey, fixture.jobId]);
    const finalJob = ReaderSummaryJob.rehydrate({ id: fixture.jobId, tenantId: tenantId(day.tenantId), workspaceId: workspaceId(day.workspaceId),
      scope: { type: "workspace" }, period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC", startedAt: start, endedAt: end }),
      status: "completed", idempotencyKey, requestedAt: new Date(), startedAt: new Date(), completedAt: new Date(), readerSummaryId: fixture.artifactId });
    const command = { finalJob } as ReaderSummaryPublicationCommand; // Daily v2 locates the persisted fixture; it reads no caller artifact bytes.
    const commitDatasetChange = async (tx: PrismaReaderSummaryClient) => {
      const deadline = await tx.$queryRaw<readonly { timeout: string }[]>`SELECT current_setting('statement_timeout') AS timeout`;
      expect(deadline).toEqual([{ timeout: "5min" }]);
      await f.admin.query("UPDATE source_items SET body='intervening committed change' WHERE id=(SELECT id FROM source_items LIMIT 1)");
    };
    const publicationClient = await f.openPrisma({ afterDeadline: commitDatasetChange });
    // OLD full adapter order: real middleware, real deadline, trusted lock,
    // then the same manifest/digest validation sees its stale snapshot. Abort
    // deliberately before the publisher; no stale publication is produced.
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      publicationClient, async (tx) => {
        await tx.$queryRaw`SELECT firstpub_snapshot_probe.lock_dataset()::text`;
        const staleGuard = new ReaderSummaryDayDatasetGuard(tx, inventory.datasetManifest, "a".repeat(64), () => new Date(), undefined, inventory);
        await staleGuard.assertCurrent("before_evidence_selection");
        await staleGuard.assertCurrent("after_evidence_selection");
        await staleGuard.assertCurrent("before_publication");
        throw new Error("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_DATASET_CHANGE");
      }).publish(command))).rejects.toThrow("OLD_SERIALIZABLE_ACCEPTED_COMMITTED_DATASET_CHANGE");
    expect(await readFirstPublicationObservationScope(client, inventory.datasetManifest)).not.toBe(inventory.observationScopeSha256);
    await f.admin.query("UPDATE source_items SET body='synthetic'");
    const publicationGuard = await makeGuard();
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      publicationClient, (tx) => publicationGuard.assertCurrentForPublicationTransaction(tx), "first_publication_sep29").publish(command))).rejects.toThrow("changed");
    expect((await f.admin.query("SELECT current_publication_id FROM reader_summary_publication_slots")).rows[0].current_publication_id).toBeNull();
    await f.admin.query("UPDATE source_items SET body='synthetic'");
    const finalGuard = await makeGuard();
    await expect(runWithTenantDatabaseAccess(day, () => new PrismaReaderSummaryPublication(
      client, (tx) => finalGuard.assertCurrentForPublicationTransaction(tx), "first_publication_sep29").publish(command))).resolves.toBe("published");
    expect((await f.admin.query("SELECT current_publication_id FROM reader_summary_publication_slots")).rows[0].current_publication_id).toBe(fixture.artifactId);
    await expectFirstpubPrismaSqlState(reserve(), "P0001");
    expect(genuineStatementFailureObserved).toBe(true);
    expect(abortedTransactionOutcome[0]?.status).toBe("rejected");
  } catch (error) { operationFailed = true; operationError = error; }
  session.release();
  const [cleanup] = await Promise.allSettled([f.stop()]);
  if (cleanup.status === "rejected") {
    if (operationFailed) throw new AggregateError([operationError, cleanup.reason as unknown], `Native proof failed and close uncertain; retained ${f.root}`);
    throw cleanup.reason;
  }
  if (operationFailed) throw operationError;
}, 120_000);

// This retains the original protected child/refusal assertions independently.
// Its frozen parent still expects raw pg SQLSTATE; it is NOT certified by the
// Prisma bridge gate and requires its own exact independent review/execution.
it("separate original native OS crash/refusal proof (not Prisma bridge certification)", async () => {
  const f = await createFirstPublicationPg18Fixture();
  const [operation] = await Promise.allSettled([f.withClaimCase("slots_unknown", proveNativeFirstpubProcessCrash)]);
  const [cleanup] = await Promise.allSettled([f.stop()]);
  if (operation.status === "rejected" && cleanup.status === "rejected") {
    throw new AggregateError([operation.reason as unknown, cleanup.reason as unknown], `OS proof failed and close uncertain; retained ${f.root}`);
  }
  if (operation.status === "rejected") throw operation.reason;
  if (cleanup.status === "rejected") throw cleanup.reason;
}, 120_000);
