import { randomUUID, createHash } from "node:crypto";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { reserveFirstPublicationDay } from "./reader-summary-first-publication-reservation";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { createFirstpubPg18Lifecycle } from "./reader-summary-first-publication-pg18-lifecycle.spec-support";
import { readPublicationBootstrapSql } from "./reader-summary-publication-bootstrap-sql";
import { provisionReaderSummaryPublicationFixtureScope, readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";
import { createNativeFirstpubPrismaConnection, closeFirstpubPrismaOwners, expectFirstpubPrismaSqlState,
  type NativeFirstpubPrismaConnection, type NativeFirstpubTransactionHooks } from "./reader-summary-first-publication-pg18-prisma.spec-support";
import type { PrismaTransactionalSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-summary-transaction";
import { forwardFirstpubCrashReservation, requireFirstpubGeneratedPrerequisite,
  type FirstpubCrashComposition, type FirstpubLifecycleComposition } from "./reader-summary-first-publication-pg18-composition.spec-support";
import { nativeFirstpubPrismaClient } from "./reader-summary-first-publication-pg18-prisma.spec-support";
import type { FirstPublicationDay } from "./reader-summary-first-publication-reservation";
export { nativeFirstpubPrismaClient } from "./reader-summary-first-publication-pg18-prisma.spec-support";
export type { NativeFirstpubTransactionHooks } from "./reader-summary-first-publication-pg18-prisma.spec-support";

export const firstpubContractMigration = "20261001220000_reader_summary_first_publication_finite_contract";
export const pg18FixtureScope = readerSummaryPublicationFixtureScope;
export type NativeFirstpubClaimCase = `${"jobs" | "artifacts" | "publications" | "slots" | "daily_model_jobs"}_${"failed" | "unknown"}`;
export type NativeFirstpubClaimFixture = Readonly<{
  admin: Pool; finite: Pool; client: PrismaTransactionalSummaryClient;
  socketHost: string; database: string;
}>;

/** No external connection URL, shared server, Docker, installation, passwords or TCP.
 * A native PG18 binary directory is mandatory. Missing proof fails, never skips.
 * /proc/<this pid>/cwd is only a short alias to our owned workspace: Unix socket
 * paths otherwise exceed sun_path's limit in long worker workspace names. */
export async function createFirstPublicationPg18Fixture(
  composition: FirstpubLifecycleComposition = { kind: "genuine" },
) {
  if (typeof process.getuid !== "function" || typeof process.geteuid !== "function" ||
      process.getuid() === 0 || process.geteuid() === 0 || process.getuid() !== process.geteuid()) {
    throw new Error("FIRSTPUB native fixture requires an admitted nonroot identity before namespace creation");
  }
  // A required generated graph must be loadable before creating any native
  // namespace. The unchanged loader fails instead of generating or skipping.
  requireFirstpubGeneratedPrerequisite(composition, loadPrismaRuntimeClient);
  const bin = process.env.FIRSTPUB_NATIVE_PG18_BIN ?? "/usr/lib/postgresql/18/bin";
  const required = ["initdb", "pg_ctl", "postgres"].map((name) => join(bin, name));
  if (!required.every(existsSync)) {
    throw new Error(`Native disposable PG18 proof unavailable: installed initdb/pg_ctl/postgres missing in ${bin}; no install or shared-server fallback allowed`);
  }
  const lifecycle = createFirstpubPg18Lifecycle(bin);
  const { root, host } = lifecycle;
  const database = "firstpub_synthetic";
  const pools = new Set<Pool>();
  const prismaOwners = new Set<NativeFirstpubPrismaConnection>();
  let prismaConstructionFailure: unknown;
  let prismaConstructionFailed = false;
  const assertPrismaConstructionCertain = () => {
    if (prismaConstructionFailed) {
      throw new AggregateError([prismaConstructionFailure], `Prisma construction cleanup uncertain; retained ${root}`);
    }
  };
  const openPrisma = async (hooks: NativeFirstpubTransactionHooks = {}, db = database) => {
    if (composition.kind !== "genuine") {
      throw new Error("Offline lifecycle fault composition cannot acquire Prisma connections");
    }
    let connection: NativeFirstpubPrismaConnection;
    try { connection = await createNativeFirstpubPrismaConnection({ socketHost: host, database: db }, hooks); }
    catch (error) { prismaConstructionFailed = true; prismaConstructionFailure = error; throw error; }
    const owner = new Proxy(connection, {
      get(target, property) {
        if (property === "close") return async () => { await target.close(); prismaOwners.delete(owner); };
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    prismaOwners.add(owner);
    return owner;
  };
  const pool = (user: string, db = database) => {
    const value = new Pool({ host, port: 5432, user, database: db, max: 4, connectionTimeoutMillis: 5000 });
    pools.add(value); return value;
  };
  const closePool = async (value: Pool) => { await value.end(); pools.delete(value); };
  const stop = async () => {
    await closeFirstpubPrismaOwners(prismaOwners);
    assertPrismaConstructionCertain();
    await Promise.all([...pools].map(closePool));
    lifecycle.stop();
  };
  try {
    lifecycle.initializeAndStart();
    const server = pool("firstpub_synthetic_super", "postgres");
    await server.query(`CREATE ROLE firstpub_synthetic_legacy LOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE firstpub_synthetic_migrator LOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE INHERIT;
      CREATE ROLE social_monitor_summary_once NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE firstpub_synthetic_finite LOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT social_monitor_summary_once TO firstpub_synthetic_finite;
      CREATE ROLE social_monitor_reader_summary_daily_terminal LOGIN NOSUPERUSER NOBYPASSRLS;`);
    await server.query(`CREATE DATABASE ${database} OWNER firstpub_synthetic_legacy`);
    const legacy = pool("firstpub_synthetic_legacy");
    let migrator = pool("firstpub_synthetic_migrator");
    let admin = pool("firstpub_synthetic_super");
    await admin.query("GRANT ALL ON DATABASE firstpub_synthetic TO firstpub_synthetic_migrator; GRANT firstpub_synthetic_legacy TO firstpub_synthetic_migrator");
    const migrations = readdirSync(resolve("prisma/migrations")).filter((p) => existsSync(resolve("prisma/migrations", p, "migration.sql"))).sort();
    for (const name of migrations.filter((n) => n < "20260716170000_reader_summary_fail_closed_publication")) {
      await legacy.query(readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    const bootstrap = (phase: "pre" | "post") => readPublicationBootstrapSql(resolve(`ops/deploy/reader-summary-publication-${phase}-migration.sql`))
      .replace(/:'runtime_role'/gu, "'firstpub_synthetic_legacy'")
      .replace(/:'system_runtime_role'/gu, "'firstpub_synthetic_legacy'");
    await migrator.query(bootstrap("pre"));
    for (const name of migrations.filter((n) => n >= "20260716170000_reader_summary_fail_closed_publication" && n !== firstpubContractMigration)) {
      await migrator.query(readFileSync(resolve("prisma/migrations", name, "migration.sql"), "utf8"));
    }
    await migrator.query(bootstrap("post"));
    const scopeConnection = await admin.connect();
    try { await provisionReaderSummaryPublicationFixtureScope(scopeConnection); }
    finally { scopeConnection.release(); }
    await admin.query(`GRANT USAGE ON SCHEMA public TO social_monitor_summary_once;
      GRANT SELECT,INSERT,UPDATE ON reader_summary_jobs,reader_summary_artifacts TO social_monitor_summary_once;
      GRANT SELECT ON reader_summary_publications,reader_summary_publication_slots,reader_summary_daily_model_jobs,
        feed_items,source_items,source_bindings,interests,source_catalog_entries TO social_monitor_summary_once;
      GRANT EXECUTE ON FUNCTION public.publish_reader_summary(jsonb) TO social_monitor_summary_once;`);
    // Immutable claim ledgers cannot be reset between scenarios. Clone only
    // our freshly migrated, empty synthetic DB before any finite connection.
    await Promise.all([legacy, migrator, admin].map(closePool));
    await server.query("CREATE DATABASE firstpub_synthetic_template TEMPLATE firstpub_synthetic");
    migrator = pool("firstpub_synthetic_migrator");
    admin = pool("firstpub_synthetic_super");
    const finite = pool("firstpub_synthetic_finite");
    // Only the scope UUID constants change in this isolated fixture; SQL bodies,
    // role trust, trigger, privileges and transaction contracts are the patch.
    const contractSql = readFileSync(resolve("prisma/migrations", firstpubContractMigration, "migration.sql"), "utf8")
        .replaceAll("00000000-0000-7000-8000-000000006101", pg18FixtureScope.tenantId)
        .replaceAll("00000000-0000-7000-8000-000000006102", pg18FixtureScope.workspaceId);
    const installContract = async () => { await migrator.query(contractSql); };
    const withClaimCase = async (name: NativeFirstpubClaimCase, operation: (fixture: NativeFirstpubClaimFixture) => Promise<void>) => {
      if (!/^(jobs|artifacts|publications|slots|daily_model_jobs)_(failed|unknown)$/u.test(name)) {
        throw new Error("Unknown bounded synthetic claim case");
      }
      if (prismaOwners.size !== 0) throw new Error("Close owned Prisma leases before switching to a claim clone");
      const clone = `firstpub_synthetic_claim_${name}`;
      await server.query(`CREATE DATABASE ${clone} TEMPLATE firstpub_synthetic_template`);
      const cloneAdmin = pool("firstpub_synthetic_super", clone);
      const cloneMigrator = pool("firstpub_synthetic_migrator", clone);
      const cloneFinite = pool("firstpub_synthetic_finite", clone);
      let operationError: unknown;
      let operationFailed = false;
      try {
        await cloneMigrator.query(contractSql);
        const client = await openPrisma({}, clone);
        await operation({ admin: cloneAdmin, finite: cloneFinite, client, socketHost: host, database: clone });
      } catch (error) { operationFailed = true; operationError = error; }
      try {
        // Config ownership must be released before dropping the clone or using
        // the main DB. Failed cleanup retains the clone and owned namespace.
        await closeFirstpubPrismaOwners(prismaOwners);
        assertPrismaConstructionCertain();
        await Promise.all([cloneAdmin, cloneMigrator, cloneFinite].map(closePool));
        if (!operationFailed) await server.query(`DROP DATABASE ${clone}`);
      } catch (cleanupError) {
        if (operationFailed) throw new AggregateError([operationError, cleanupError], `Claim failed and cleanup uncertain; retained ${root}`);
        throw cleanupError;
      }
      if (operationFailed) throw operationError;
    };
    const principal = (user: string) => {
      if (!/^firstpub_synthetic_(finite|bypass|super_member|missing|owner_set|schema_set)$/u.test(user)) {
        throw new Error("Unknown bounded synthetic principal");
      }
      return pool(user);
    };
    return { admin, finite, root, installContract, withClaimCase, principal, stop, openPrisma };
  } catch (error) {
    if (!lifecycle.isOwned()) throw error;
    try { await stop(); } catch (shutdownError) { throw new AggregateError([error, shutdownError], `Own PG18 fixture failed; retained ${root}`); }
    throw error;
  }
}

/** Default crash execution keeps the genuine factory and its owned lease.
 * Offline consumers must explicitly supply a reservation completion port;
 * neither Pool shape nor cwd/environment selects a substitute client. */
export async function reserveFirstpubCrashDay(
  pool: Pool, input: FirstPublicationDay, reservedAt: Date,
  composition: FirstpubCrashComposition = { kind: "genuine" },
): Promise<void> {
  await forwardFirstpubCrashReservation(pool, input, reservedAt, composition,
    async (genuinePool, genuineDay, genuineTime) => {
      await reserveFirstPublicationDay(nativeFirstpubPrismaClient(genuinePool), genuineDay, genuineTime);
    });
}


// Migrated native matrix: the frozen legacy helper still expects pg errors.
const start = new Date("2026-09-29T00:00:00.000Z"), end = new Date("2026-09-30T00:00:00.000Z");
const day = { ...pg18FixtureScope, startedAt: start.toISOString(), endedAt: end.toISOString() };
const periodKey = `daily:${day.startedAt}:${day.endedAt}:UTC`;

/** Every case commits its claim in an independent, empty synthetic DB clone.
 * No ledger is deleted, trigger disabled, or impossible FAILED publication
 * status fabricated. Slots/publications have no caller-failure status: both
 * failed and UNKNOWN describe the caller after that durable commit. */
export async function proveNativeFirstpubPrismaClaimMatrix(
  withClaimCase: (name: NativeFirstpubClaimCase, operation: (fixture: NativeFirstpubClaimFixture) => Promise<void>) => Promise<void>,
): Promise<void> {
  for (const category of ["jobs", "artifacts", "publications", "slots", "daily_model_jobs"] as const) {
    for (const outcome of ["failed", "unknown"] as const) {
      await withClaimCase(`${category}_${outcome}`, async (f) => {
        const status = outcome === "failed" ? "FAILED" : "RUNNING";
        const params = [randomUUID(), day.tenantId, day.workspaceId, start, end, periodKey, status];
        if (category === "jobs") {
          await f.admin.query(`INSERT INTO reader_summary_jobs(id,tenant_id,workspace_id,scope_type,scope_key,cadence,
            period_started_at,period_ended_at,period_timezone,period_key,status,idempotency_key,requested_at,created_at,updated_at)
            VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,$1::text,$5,$5,$5)`, params);
        } else if (category === "artifacts") {
          await f.admin.query(`INSERT INTO reader_summary_artifacts(id,tenant_id,workspace_id,scope_type,scope_key,cadence,
            period_started_at,period_ended_at,period_timezone,period_key,status,model_version,prompt_version,headline,
            artifact_payload,citations,quality_signals,created_at,updated_at)
            VALUES($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,'synthetic','synthetic','synthetic',
              '{}','[]','{}',$5,$5)`, params);
        } else if (category === "slots") {
          await reserveFirstPublicationDay(f.client, day, new Date());
        } else if (category === "publications") {
          const seed = await f.admin.connect();
          const fixture = await (async () => {
            try { return await createReaderSummaryPublicationRunningFixture(seed, "NO_SIGNAL", "2026-09-29", { providerEvidence: "none" }); }
            finally { seed.release(); }
          })();
          const payload = JSON.stringify(fixture.payload);
          const rows = await runWithTenantDatabaseAccess(day, () => f.client.$queryRaw<readonly { outcome: string }[]>`
            SELECT * FROM public.publish_reader_summary(${payload}::jsonb)`);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.outcome).toBe("published");
          // Publication, artifact and job FKs remain real. This scenario does
          // not corrupt parents merely to isolate one OR predicate.
        } else {
          const canonical = Buffer.from("{}", "utf8");
          const digest = createHash("sha256").update(canonical).digest("hex");
          await f.admin.query(`INSERT INTO reader_summary_daily_source_authorities
            (tenant_id,workspace_id,requested_utc_date,ingestion_cutoff,canonical_record,canonical_bytes,canonical_sha256,created_at)
            VALUES($1,$2,'2026-09-29',$3,'{}',$4,$5,$3)`, [day.tenantId, day.workspaceId, end, canonical, digest]);
          await f.admin.query(`INSERT INTO reader_summary_daily_model_jobs
            (tenant_id,workspace_id,requested_utc_date,identity,source_authority_sha256,provider,model,reasoning_effort,
              runtime_engine,state,reserved_at,running_at,failed_ambiguous_at)
            VALUES($1,$2,'2026-09-29',$3,$4,'synthetic','synthetic','synthetic','synthetic',$5,$6,$6,
              CASE WHEN $5='FAILED_AMBIGUOUS' THEN $6::timestamptz ELSE NULL END)`,
          [day.tenantId, day.workspaceId, randomUUID(), digest, outcome === "failed" ? "FAILED_AMBIGUOUS" : "RUNNING", end]);
        }
        // Check committed rows through an independent new finite connection.
        const connection = await f.finite.connect();
        try {
          await connection.query(`SELECT set_config('social_monitor.tenant_id',$1,false),
            set_config('social_monitor.workspace_id',$2,false),set_config('social_monitor.system_access','false',false)`,
          [day.tenantId, day.workspaceId]);
          const table = {
            jobs: "reader_summary_jobs", artifacts: "reader_summary_artifacts", publications: "reader_summary_publications",
            slots: "reader_summary_publication_slots", daily_model_jobs: "reader_summary_daily_model_jobs",
          }[category];
          const rows = await connection.query(`SELECT count(*) FROM public.${table}`);
          expect(Number(rows.rows[0].count)).toBe(1);
        } finally { connection.release(); }
        let providerEffects = 0;
        await expectFirstpubPrismaSqlState((async () => {
          await reserveFirstPublicationDay(f.client, day, new Date());
          providerEffects++;
        })(), "P0001");
        expect(providerEffects).toBe(0);
      });
    }
  }
}
