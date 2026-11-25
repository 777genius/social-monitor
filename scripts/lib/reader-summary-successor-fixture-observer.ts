/** Disposable-fixture capabilities only. Never loaded by production bootstrap. */
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { fixtureObserverRole, fixtureRuntimeRole } from "./reader-summary-successor-fixture-safety";

export const observerRelations = ["source_item_engagement_snapshots", "source_items", "feed_items",
  "source_item_engagement_observations", "source_item_engagement_daily_rollups", "source_bindings",
  "interests", "source_catalog_entries", "reader_summary_policies", "reader_summary_jobs",
  "reader_summary_artifacts", "reader_summary_publications", "reader_summary_publication_slots",
  "reader_summary_new_input_refresh_reconciliations"] as const;

export async function assertSubjectPrivileges(db: Pick<Pool, "query">): Promise<void> {
  const result = await db.query(`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
    pg_has_role(rolname,'social_monitor_public_schema_owner','MEMBER') as schema_owner,
    pg_has_role(rolname,'social_monitor_reader_summary_publication_owner','MEMBER') as publication_owner,
    exists(select 1 from pg_class where relowner=pg_roles.oid and relnamespace='public'::regnamespace) as owns_relation,
    exists(select 1 from pg_database where datdba=pg_roles.oid) as owns_database,
    has_table_privilege(rolname,'public.reader_summary_publications','INSERT,UPDATE,DELETE,TRUNCATE') as ledger_write,
    has_table_privilege(rolname,'public.reader_summary_publication_slots','INSERT,UPDATE,DELETE,TRUNCATE') as slot_write
    from pg_roles where rolname=$1`, [fixtureRuntimeRole]);
  assert.deepEqual(result.rows, [{ rolsuper: false, rolcreatedb: false, rolcreaterole: false,
    rolreplication: false, rolbypassrls: false, schema_owner: false, publication_owner: false,
    owns_relation: false, owns_database: false, ledger_write: false, slot_write: false }]);
}

export async function provisionSuccessorObserver(admin: Pool): Promise<void> {
  await assertSubjectPrivileges(admin);
  const db = await admin.connect();
  try {
    await db.query("BEGIN");
    await db.query(`CREATE ROLE ${fixtureObserverRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ${fixtureObserverRole};
      GRANT INSERT ON ${observerRelations.map(name => `public.${name}`).join(",")} TO ${fixtureObserverRole};
      GRANT SELECT ON public.reader_summary_policies, public.reader_summary_jobs,
        public.reader_summary_new_input_refresh_reconciliations,
        public.reader_summary_new_input_refresh_reconciliation_counters, public._prisma_migrations TO ${fixtureObserverRole};
      GRANT UPDATE(tone) ON public.reader_summary_policies TO ${fixtureObserverRole};
      GRANT UPDATE(status,failed_at,updated_at) ON public.reader_summary_jobs TO ${fixtureObserverRole};
      CREATE SCHEMA reader_summary_refresh_test_observer;
      REVOKE ALL ON SCHEMA reader_summary_refresh_test_observer FROM PUBLIC;
      GRANT USAGE ON SCHEMA reader_summary_refresh_test_observer TO ${fixtureObserverRole};
      CREATE FUNCTION reader_summary_refresh_test_observer.identity()
      RETURNS TABLE(directory text, identifier text, database text)
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $identity$
        SELECT current_setting('data_directory'), system_identifier::text, current_database()::text
        FROM pg_catalog.pg_control_system()
      $identity$;
      REVOKE ALL ON FUNCTION reader_summary_refresh_test_observer.identity() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION reader_summary_refresh_test_observer.identity() TO ${fixtureObserverRole};
      CREATE FUNCTION reader_summary_refresh_test_observer.terminate_holder(target_pid integer, target_vxid text)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $terminate$
      BEGIN
        IF session_user <> '${fixtureObserverRole}' OR target_pid IS NULL OR target_vxid IS NULL
          OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity a JOIN pg_catalog.pg_locks l ON l.pid=a.pid
            WHERE a.pid=target_pid AND a.usename='${fixtureRuntimeRole}' AND a.datname=current_database()
              AND a.backend_type='client backend' AND l.database=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())
              AND l.relation='public.reader_summary_jobs'::regclass AND l.mode='ShareLock' AND l.granted
              AND l.virtualtransaction=target_vxid
              AND EXISTS(SELECT 1 FROM pg_catalog.pg_locks v WHERE v.pid=a.pid AND v.locktype='virtualxid'
                AND v.virtualxid=target_vxid AND v.mode='ExclusiveLock' AND v.granted)) THEN
          RAISE EXCEPTION 'invalid fixture holder identity' USING ERRCODE='42501';
        END IF;
        RETURN pg_catalog.pg_terminate_backend(target_pid,1000);
      END $terminate$;
      REVOKE ALL ON FUNCTION reader_summary_refresh_test_observer.terminate_holder(integer,text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION reader_summary_refresh_test_observer.terminate_holder(integer,text) TO ${fixtureObserverRole}`);
    await assertSubjectPrivileges(db);
    const membership = await db.query("select pg_has_role($1,$2,'MEMBER') as member", [fixtureRuntimeRole, fixtureObserverRole]);
    assert.deepEqual(membership.rows, [{ member: false }]);
    await db.query("COMMIT");
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
