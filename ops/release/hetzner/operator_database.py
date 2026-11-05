"""One separately provisioned local PG18 observer connection for SQL and identity."""
from prisma_history import seal, summarize
from contract import require
from operator_config import EXECUTABLES, PASS, SERVICE, decode, exact, uint64

IDENTITY_SQL = """
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '10000ms';
SET LOCAL search_path = pg_catalog, public;
SELECT json_build_object(
 'server_major', current_setting('server_version_num')::int / 10000,
 'system_identifier', (SELECT system_identifier::text FROM pg_control_system()),
 'database', current_database(), 'role', current_user,
 'port', current_setting('port'),
 'transaction_read_only', current_setting('transaction_read_only') = 'on',
 'read_only_role', NOT EXISTS (
   SELECT FROM pg_roles WHERE pg_has_role(oid, 'MEMBER')
   AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
     OR rolname IN ('pg_write_all_data','pg_execute_server_program','pg_write_server_files',
                   'pg_read_server_files','pg_signal_backend','pg_checkpoint','pg_maintain')))
 AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_roles r ON pg_has_role(r.oid, 'MEMBER')
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND left(n.nspname, 8) <> 'pg_toast' AND left(n.nspname, 8) <> 'pg_temp_'
   AND ((c.relkind IN ('r','p','v','m','f') AND
     (has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(r.oid, c.oid, 'INSERT,UPDATE,REFERENCES')))
     OR (c.relkind='S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE,UPDATE'))))
 AND NOT EXISTS (SELECT FROM pg_proc p JOIN pg_roles r ON pg_has_role(r.oid, 'MEMBER')
   WHERE p.prosecdef AND has_function_privilege(r.oid, p.oid, 'EXECUTE'))
 AND NOT EXISTS (SELECT FROM pg_namespace n JOIN pg_roles r ON pg_has_role(r.oid, 'MEMBER')
   WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
   AND has_schema_privilege(r.oid, n.oid, 'CREATE'))
 AND NOT EXISTS (SELECT FROM pg_roles WHERE pg_has_role(oid, 'MEMBER')
   AND has_database_privilege(oid, current_database(), 'CREATE,TEMP')),
 'migrations', %s, 'history_complete', %s, 'history_context', %s);
ROLLBACK;
"""
HISTORY_SQL = """(SELECT coalesce(json_agg(json_build_object(
 'id', id, 'name', migration_name, 'checksum', checksum,
 'applied_steps_count', applied_steps_count,
 'finished_at', finished_at::text, 'rolled_back_at', rolled_back_at::text,
 'started_at', started_at::text) ORDER BY migration_name, id), '[]'::json)
 FROM public._prisma_migrations)"""

HISTORY_COMPLETE_SQL = """(SELECT count(*) = 1 FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname='_prisma_migrations'
 AND c.relkind='r' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
 AND has_table_privilege(c.oid, 'SELECT'))"""

HISTORY_CONTEXT_SQL = """json_build_object(
 'version', 1, 'system_identifier', (SELECT system_identifier::text FROM pg_control_system()),
 'database', current_database(), 'observer_role', current_user, 'port', current_setting('port'),
 'observed_at', statement_timestamp()::text,
 'relation', (SELECT json_build_object('schema', n.nspname, 'name', c.relname,
   'oid', c.oid::bigint, 'kind', c.relkind) FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='_prisma_migrations'),
 'snapshot', json_build_object('id', pg_current_snapshot()::text,
   'isolation', current_setting('transaction_isolation'),
   'read_only', current_setting('transaction_read_only')='on'),
 'visibility', (SELECT json_build_object('complete', %s,
   'select', has_table_privilege(c.oid, 'SELECT'), 'rls_enabled', c.relrowsecurity,
   'rls_forced', c.relforcerowsecurity) FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='_prisma_migrations'),
 'row_count', (SELECT count(*) FROM public._prisma_migrations))""" % HISTORY_COMPLETE_SQL


def observe(config, runner, history=False):
    config.recheck()
    raw = runner.run([EXECUTABLES['psql'], '-X', '-q', '-A', '-t', '--no-password',
                      '--set=ON_ERROR_STOP=1', '--dbname=service=' + config.db['service'], '-f', '-'],
                     data=(IDENTITY_SQL % (HISTORY_SQL if history else 'null',
                                          HISTORY_COMPLETE_SQL if history else 'null',
                                          HISTORY_CONTEXT_SQL if history else 'null')).encode(),
                     env={'PGSERVICEFILE': SERVICE, 'PGPASSFILE': PASS}, limit=2 * 1024**2)
    value = decode(raw, 2 * 1024**2)
    exact(value, ('server_major', 'system_identifier', 'database', 'role', 'port',
                  'transaction_read_only', 'read_only_role', 'migrations', 'history_complete', 'history_context'))
    require(type(value['server_major']) is int and value['server_major'] == 18
            and value['database'] == config.db['database'] and value['role'] == config.db['role']
            and value['port'] == config.db['port']
            and uint64(value['system_identifier']) == config.core['backup_identity']['system_identifier']
            and isinstance(value['system_identifier'], str)
            and value['transaction_read_only'] is True and value['read_only_role'] is True,
            'operator-database-identity-role')
    require(value['history_complete'] is True if history else value['history_complete'] is None,
            'operator-history-visibility')
    config.recheck()
    return value


def identity(config, runner):
    value = observe(config, runner)
    require(value['migrations'] is None and value['history_context'] is None, 'operator-identity-shape')
    return {'method': 'pg_control_system', 'server_major': 18,
            'system_identifier': value['system_identifier']}


def database(config, runner):
    value = observe(config, runner, history=True)
    proof = seal(value['history_context'], value['migrations'])
    require(all(proof[k] == value[v] for k, v in (
        ('system_identifier', 'system_identifier'), ('database', 'database'),
        ('observer_role', 'role'), ('port', 'port'))), 'operator-history-binding')
    applied, failed = summarize(proof)
    return {'server_major': 18, 'system_identifier': value['system_identifier'],
            'database': value['database'], 'observer_role': value['role'], 'port': value['port'],
            'read_only_role': True, 'transaction_read_only': True,
            'history': proof, 'failed_migrations': failed, 'applied_migrations': applied}
