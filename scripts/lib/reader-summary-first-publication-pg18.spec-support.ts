import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { createFirstpubPg18Lifecycle } from "./reader-summary-first-publication-pg18-lifecycle.spec-support";
import { readPublicationBootstrapSql } from "./reader-summary-publication-bootstrap-sql";
import { provisionReaderSummaryPublicationFixtureScope, readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";
import { guardRootClientDuringInteractiveTransaction } from "../../libs/platform/persistence/src/postgres-runtime-pool-transaction-guard";
import type { PrismaSummaryTransactionOptions, PrismaTransactionalSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-summary-transaction";
import type { PrismaReaderSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-client";

export const firstpubContractMigration = "20261001220000_reader_summary_first_publication_finite_contract";
export const pg18FixtureScope = readerSummaryPublicationFixtureScope;
export type NativeFirstpubClaimCase = `${"jobs" | "artifacts" | "publications" | "slots" | "daily_model_jobs"}_${"failed" | "unknown"}`;
export type NativeFirstpubClaimFixture = Readonly<{
  admin: Pool; finite: Pool; client: PrismaTransactionalSummaryClient;
  socketHost: string; database: string;
}>;

/** No connection URL, shared server, Docker, installation, passwords or TCP.
 * A native PG18 binary directory is mandatory. Missing proof fails, never skips.
 * /proc/<this pid>/cwd is only a short alias to our owned workspace: Unix socket
 * paths otherwise exceed sun_path's limit in long worker workspace names. */
export async function createFirstPublicationPg18Fixture() {
  if (typeof process.getuid !== "function" || typeof process.geteuid !== "function" ||
      process.getuid() === 0 || process.geteuid() === 0 || process.getuid() !== process.geteuid()) {
    throw new Error("FIRSTPUB native fixture requires an admitted nonroot identity before namespace creation");
  }
  const bin = process.env.FIRSTPUB_NATIVE_PG18_BIN ?? "/usr/lib/postgresql/18/bin";
  const required = ["initdb", "pg_ctl", "postgres"].map((name) => join(bin, name));
  if (!required.every(existsSync)) {
    throw new Error(`Native disposable PG18 proof unavailable: installed initdb/pg_ctl/postgres missing in ${bin}; no install or shared-server fallback allowed`);
  }
  const lifecycle = createFirstpubPg18Lifecycle(bin);
  const { root, host } = lifecycle;
  const database = "firstpub_synthetic";
  const pools = new Set<Pool>();
  const pool = (user: string, db = database) => {
    const value = new Pool({ host, port: 5432, user, database: db, max: 4, connectionTimeoutMillis: 5000 });
    pools.add(value); return value;
  };
  const closePool = async (value: Pool) => { await value.end(); pools.delete(value); };
  const stop = async () => {
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
      const clone = `firstpub_synthetic_claim_${name}`;
      await server.query(`CREATE DATABASE ${clone} TEMPLATE firstpub_synthetic_template`);
      const cloneAdmin = pool("firstpub_synthetic_super", clone);
      const cloneMigrator = pool("firstpub_synthetic_migrator", clone);
      const cloneFinite = pool("firstpub_synthetic_finite", clone);
      try {
        await cloneMigrator.query(contractSql);
        await operation({ admin: cloneAdmin, finite: cloneFinite, client: nativeFirstpubPrismaClient(cloneFinite), socketHost: host, database: clone });
      } finally {
        await Promise.all([cloneAdmin, cloneMigrator, cloneFinite].map(closePool));
        await server.query(`DROP DATABASE ${clone}`);
      }
    };
    const principal = (user: string) => {
      if (!/^firstpub_synthetic_(finite|bypass|super_member|missing|owner_set|schema_set)$/u.test(user)) {
        throw new Error("Unknown bounded synthetic principal");
      }
      return pool(user);
    };
    return { admin, finite, root, installContract, withClaimCase, principal, stop, client: nativeFirstpubPrismaClient(finite) };
  } catch (error) {
    if (!lifecycle.isOwned()) throw error;
    try { await stop(); } catch (shutdownError) { throw new AggregateError([error, shutdownError], `Own PG18 fixture failed; retained ${root}`); }
    throw error;
  }
}

/** Executes the actual adapter callback and unchanged tenant middleware over
 * native PG connections; template parameters stay separate from SQL text. */
export type NativeFirstpubTransactionHooks = Readonly<{
  afterTenantContext?: () => Promise<void>;
  afterDeadline?: () => Promise<void>;
}>;

export function nativeFirstpubPrismaClient(
  pool: Pool, hooks: NativeFirstpubTransactionHooks = {},
): PrismaTransactionalSummaryClient {
  const sql = (query: TemplateStringsArray) => query.reduce((result, part, i) => result + (i ? `$${i}` : "") + part, "");
  const raw = {
    $transaction: async <T>(callback: (tx: PrismaReaderSummaryClient) => Promise<T>, options?: PrismaSummaryTransactionOptions) => {
      const connection = await pool.connect();
      try {
        if (options?.isolationLevel !== undefined &&
            options.isolationLevel !== "Serializable" && options.isolationLevel !== "ReadCommitted") {
          throw new Error("Native firstpub fixture does not support the requested isolation");
        }
        await connection.query(`BEGIN ISOLATION LEVEL ${options?.isolationLevel === "Serializable" ? "SERIALIZABLE" : "READ COMMITTED"}`);
        let contextConfigured = false;
        let deadlineConfigured = false;
        const tx = {
          $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
            const statement = sql(query);
            const result = await connection.query(statement, values);
            if (!deadlineConfigured && statement.includes("set_config('statement_timeout'")) {
              deadlineConfigured = true;
              await hooks.afterDeadline?.();
            }
            return result.rows;
          },
          $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => (await connection.query(sql(query), values)).rowCount,
          $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
            const result = await connection.query(query, values);
            if (!contextConfigured && query.includes("set_config('social_monitor.tenant_id'")) {
              contextConfigured = true;
              await hooks.afterTenantContext?.();
            }
            return result.rowCount;
          },
        };
        const result = await callback(tx as unknown as PrismaReaderSummaryClient);
        const commit = await connection.query("COMMIT");
        // PostgreSQL returns command ROLLBACK for COMMIT on an aborted tx.
        // Treating that as success would manufacture a durability proof.
        if (commit.command !== "COMMIT") throw new Error("Native firstpub transaction did not commit");
        return result;
      } catch (error) { await connection.query("ROLLBACK"); throw error; }
      finally { connection.release(); }
    },
    $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => (await pool.query(sql(query), values)).rows,
  };
  return guardRootClientDuringInteractiveTransaction(raw) as unknown as PrismaTransactionalSummaryClient;
}
