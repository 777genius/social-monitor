"""Native PG18 ACL regression; missing Docker/root/image fails, never skips.

Red before the fix: genuine column grants and executable SECURITY DEFINER
writers pass the old predicate, but must fail production IDENTITY_SQL. One
class owns one networkless disposable container; no host/database credentials.
"""
import json
from contextlib import contextmanager
import os
from pathlib import Path
import re
import select
import subprocess
import tempfile
import time
import unittest
import uuid

from operator_database import IDENTITY_SQL, HISTORY_SQL, HISTORY_COMPLETE_SQL, HISTORY_CONTEXT_SQL
from contract import Denied
from prisma_history import seal, summarize
import operator_database
import evidence

IMAGE = 'postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722'
# Frozen rejected predicate, executed against catalogs, never a query-text test.
LEGACY_SQL = """
SELECT NOT EXISTS (
 SELECT FROM pg_roles WHERE pg_has_role(oid, 'MEMBER')
 AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls
 OR rolname IN ('pg_write_all_data','pg_execute_server_program','pg_write_server_files',
 'pg_read_server_files','pg_signal_backend','pg_checkpoint','pg_maintain')))
AND NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_roles r ON pg_has_role(r.oid, 'MEMBER')
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 AND left(n.nspname, 8) <> 'pg_toast' AND left(n.nspname, 8) <> 'pg_temp_'
 AND ((c.relkind IN ('r','p','v','m','f') AND
 has_table_privilege(r.oid, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 OR (c.relkind='S' AND has_sequence_privilege(r.oid, c.oid, 'USAGE,UPDATE'))))
AND NOT EXISTS (SELECT FROM pg_namespace n JOIN pg_roles r ON pg_has_role(r.oid, 'MEMBER')
 WHERE left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'
 AND has_schema_privilege(r.oid, n.oid, 'CREATE'))
AND NOT EXISTS (SELECT FROM pg_roles WHERE pg_has_role(oid, 'MEMBER')
 AND has_database_privilege(oid, current_database(), 'CREATE,TEMP'));
"""
SETUP_SQL = """
REVOKE CREATE, TEMP ON DATABASE sm_catalog FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE fixture_observer LOGIN;
CREATE ROLE fixture_writer;
CREATE ROLE fixture_owner;
GRANT USAGE ON SCHEMA public TO fixture_observer, fixture_writer, fixture_owner;
GRANT CREATE ON SCHEMA public TO fixture_owner;
GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO fixture_observer;
SET ROLE fixture_owner;
CREATE TABLE public.target (id integer PRIMARY KEY, value integer);
INSERT INTO public.target VALUES (1, 0);
CREATE FUNCTION public.elevated_writer() RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
 AS $$ UPDATE public.target SET value = value + 1 WHERE id = 1 $$;
CREATE PROCEDURE public.elevated_procedure()
 LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
 AS $$ UPDATE public.target SET value = value + 1 WHERE id = 1 $$;
REVOKE EXECUTE ON FUNCTION public.elevated_writer() FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE public.elevated_procedure() FROM PUBLIC;
CREATE TABLE public._prisma_migrations (
 id text, migration_name text, checksum text, started_at timestamptz,
 finished_at timestamptz, rolled_back_at timestamptz, applied_steps_count integer);
INSERT INTO public._prisma_migrations VALUES
 ('00000000-0000-0000-0000-000000000001','20261002000000_finished', repeat('a',64), now(), now(), NULL, 1),
 ('00000000-0000-0000-0000-000000000002','20261002000001_pending', repeat('b',64), now(), NULL, NULL, 0),
 ('00000000-0000-0000-0000-000000000003','20261002000002_rolled', repeat('c',64), now(), NULL, now(), 0);
GRANT SELECT ON public._prisma_migrations TO fixture_observer;
RESET ROLE;
"""


class DatabaseCatalogTests(unittest.TestCase):
    @classmethod
    def docker(cls, *args, data=None, timeout=15):
        result = subprocess.run(['/usr/bin/docker', '--config', str(cls.cli_config),
                                 '--host=unix:///var/run/docker.sock', *args], input=data, text=True,
                                capture_output=True, timeout=timeout, check=True,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'})
        return result.stdout.strip()

    @classmethod
    def cleanup(cls):
        # Even a timed-out create can leave its ID in cidfile. Never remove by
        # name, label, prefix, image, or a broad prune command.
        if cls.cidfile.exists():
            cid = cls.cidfile.read_text().strip()
            if not re.fullmatch(r'[0-9a-f]{64}', cid):
                raise AssertionError('invalid disposable container ID')
            cls.docker('rm', '--force', '--volumes', cid, timeout=20)

    @classmethod
    def setUpClass(cls):
        if os.geteuid() != 0:
            raise AssertionError('native catalog regression requires root with Docker')
        directory = tempfile.TemporaryDirectory(prefix='.sm-db-catalog-',
            dir=Path(__file__).resolve().parents[3] / 'node_modules')
        cls.addClassCleanup(directory.cleanup)
        cls.cli_config = Path(directory.name) / 'docker-empty'
        cls.cli_config.mkdir()
        image = json.loads(cls.docker('image', 'inspect', IMAGE))[0]
        if image['Os'] != 'linux' or image['Architecture'] != 'amd64':
            raise AssertionError('catalog fixture requires cached linux/amd64 image')
        cls.cidfile = Path(directory.name) / 'container-id'
        cls.addClassCleanup(cls.cleanup)
        name = 'sm-release-db-contract-' + uuid.uuid4().hex
        cls.docker('create', '--pull=never', '--platform=linux/amd64',
                   '--name', name, '--label', 'sm-release-db-contract=' + name,
                   '--network=none', '--cidfile', str(cls.cidfile),
                   '--tmpfs', '/var/lib/postgresql:rw,size=268435456',
                   '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
                   '--env', 'POSTGRES_DB=sm_catalog', IMAGE, timeout=30)
        cls.cid = cls.cidfile.read_text().strip()
        if not re.fullmatch(r'[0-9a-f]{64}', cls.cid):
            raise AssertionError('invalid disposable container ID')
        cls.docker('start', cls.cid)
        end = time.monotonic() + 45
        while True:
            try:
                cls.docker('exec', cls.cid, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'sm_catalog', timeout=5)
                break
            except subprocess.CalledProcessError:
                if time.monotonic() >= end:
                    raise AssertionError('PG18 disposable fixture did not become ready') from None
                time.sleep(.2)
        major = cls.sql("SELECT current_setting('server_version_num')::int / 10000;")
        if major != '18':
            raise AssertionError('server_major must be 18, observed ' + major)
        cls.system_id = cls.sql('SELECT system_identifier::text FROM pg_control_system();')
        cls.sql(SETUP_SQL)

    @classmethod
    def sql(cls, sql, role='postgres'):
        return cls.docker('exec', '-i', cls.cid, 'psql', '-X', '-qAt', '--no-password',
                          '--set=ON_ERROR_STOP=1', '--username=' + role,
                          '--dbname=sm_catalog', '-f', '-', data=sql)

    def observation(self, expected, history=False):
        value = json.loads(self.sql(IDENTITY_SQL % (
            HISTORY_SQL if history else 'null', HISTORY_COMPLETE_SQL if history else 'null',
            HISTORY_CONTEXT_SQL if history else 'null'),
            'fixture_observer'))
        self.assertEqual(value['server_major'], 18)
        self.assertIs(type(value['system_identifier']), str)
        self.assertRegex(value['system_identifier'], r'^[1-9][0-9]{0,19}$')
        self.assertEqual(value['system_identifier'], self.system_id)
        self.assertEqual(value['database'], 'sm_catalog')
        self.assertEqual(value['role'], 'fixture_observer')
        self.assertIs(value['transaction_read_only'], True)
        self.assertIs(value['read_only_role'], expected)
        return value

    def test_actual_column_and_security_definer_authority(self):
        self.assertEqual(self.sql(LEGACY_SQL, 'fixture_observer'), 't')
        baseline = self.observation(True, history=True)
        self.assertIs(baseline['history_complete'], True)
        self.assertEqual(len(baseline['migrations']), 3)
        self.assertIsNone(baseline['migrations'][1]['finished_at'])
        self.assertIsNotNone(baseline['migrations'][2]['rolled_back_at'])
        for grantee in ('fixture_observer', 'fixture_writer', 'PUBLIC'):
            inherited = grantee == 'fixture_writer'
            if inherited:
                self.sql('GRANT fixture_writer TO fixture_observer;')
            try:
                for privilege in ('INSERT', 'UPDATE', 'REFERENCES'):
                    with self.subTest(authority='column', grantee=grantee, privilege=privilege):
                        self.sql(f'GRANT {privilege}(value) ON public.target TO {grantee};')
                        try:
                            self.assertEqual(self.sql(LEGACY_SQL, 'fixture_observer'), 't')
                            self.observation(False)
                        finally:
                            self.sql(f'REVOKE {privilege}(value) ON public.target FROM {grantee};')
                        self.observation(True)
                for kind, name, call in (
                    ('FUNCTION', 'elevated_writer', 'SELECT public.elevated_writer();'),
                    ('PROCEDURE', 'elevated_procedure', 'CALL public.elevated_procedure();')):
                    with self.subTest(authority='security-definer', grantee=grantee, kind=kind):
                        self.sql(f'GRANT EXECUTE ON {kind} public.{name}() TO {grantee};')
                        try:
                            self.assertEqual(self.sql(LEGACY_SQL, 'fixture_observer'), 't')
                            before = int(self.sql('SELECT value FROM public.target WHERE id=1;'))
                            self.sql(call, 'fixture_observer')
                            self.assertEqual(int(self.sql('SELECT value FROM public.target WHERE id=1;')), before + 1)
                            self.observation(False)
                        finally:
                            self.sql(f'REVOKE EXECUTE ON {kind} public.{name}() FROM {grantee};')
                        self.observation(True)
            finally:
                if inherited:
                    self.sql('REVOKE fixture_writer FROM fixture_observer;')
        # MEMBER policy fences reachable roles even when INHERIT is disabled.
        self.sql('GRANT fixture_writer TO fixture_observer WITH INHERIT FALSE;')
        self.sql('GRANT UPDATE(value) ON public.target TO fixture_writer;')
        try:
            self.assertEqual(self.sql(LEGACY_SQL, 'fixture_observer'), 't')
            self.observation(False)
        finally:
            self.sql('REVOKE UPDATE(value) ON public.target FROM fixture_writer;')
            self.sql('REVOKE fixture_writer FROM fixture_observer;')
        self.observation(True)
        # Even apparently read-only unknown SECURITY DEFINER code is denied;
        # this observer needs only the native invoker pg_control_system().
        self.sql("SET ROLE fixture_owner; CREATE FUNCTION public.unknown_reader()"
                 " RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; RESET ROLE;")
        try:
            self.assertEqual(self.sql(LEGACY_SQL, 'fixture_observer'), 't')
            self.observation(False)
        finally:
            self.sql('DROP FUNCTION public.unknown_reader();')
        self.observation(True)

    # Red: old observation lacks IDs/steps/snapshot and rejects this legitimate retry.
    def test_all_attempts_consistent_snapshot_and_denied_visibility(self):
        original = self.sql('SELECT coalesce(json_agg(m),\'[]\') FROM public._prisma_migrations m;')
        sql = IDENTITY_SQL % (HISTORY_SQL, HISTORY_COMPLETE_SQL, HISTORY_CONTEXT_SQL)
        test = self
        class Config:
            db = {'service': 'TEST_catalog', 'database': 'sm_catalog', 'role': 'fixture_observer', 'port': '5432'}
            core = {'backup_identity': {'system_identifier': test.system_id}}
            def recheck(self): pass
        class Runner:
            def run(self, argv, data, **kwargs):
                return test.sql(data.decode(), 'fixture_observer').encode()
        try:
            self.sql("TRUNCATE public._prisma_migrations; INSERT INTO public._prisma_migrations VALUES "
                "('00000000-0000-0000-0000-000000000011','20260101000000_TEST_retry',repeat('a',64),"
                "'2026-01-01T00:00:00.123456Z',NULL,'2026-01-01T00:00:01.123456Z',0),"
                "('00000000-0000-0000-0000-000000000012','20260101000000_TEST_retry',repeat('a',64),"
                "'2026-01-01T00:00:01.123457Z','2026-01-01T00:00:02.123456Z',NULL,0);")
            result = {**operator_database.database(Config(), Runner()), 'observed_at': int(time.time())}
            retained = evidence.database(result, [{'name': '20260101000000_TEST_retry', 'checksum': 'a'*64}],
                                         self.system_id)
            self.assertEqual(len(retained['history']['rows']), 2)
            self.assertEqual(retained['history']['rows'][0]['rolled_back_at'], '2026-01-01T00:00:01.123456Z')
            # Establish the real transaction's snapshot, commit another row on a second
            # connection, then execute the collector's unchanged SELECT and ROLLBACK.
            prefix, query = sql.split('SELECT json_build_object(', 1)
            argv = ['/usr/bin/docker', '--config', str(self.cli_config),
                    '--host=unix:///var/run/docker.sock', 'exec', '-i', self.cid,
                    'psql', '-X', '-qAt', '--no-password', '--set=ON_ERROR_STOP=1',
                    '--username=fixture_observer', '--dbname=sm_catalog', '-f', '-']
            @contextmanager
            def observer(marker):
                child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
                try:
                    child.stdin.write(prefix + marker + '\n'); child.stdin.flush()
                    self.assertTrue(select.select([child.stdout], [], [], 15)[0], 'observer barrier timed out')
                    yield child, child.stdout.readline().strip()
                finally:
                    if child.poll() is None: child.kill()
                    child.wait()
                    for pipe in (child.stdin, child.stdout, child.stderr): pipe.close()

            # Red with transaction_timestamp(): a success committed after BEGIN
            # but before the first snapshot appears newer than the observation.
            # psql's client echo does not acquire a PostgreSQL snapshot.
            with observer('\\echo TEST-BEGIN-BEFORE-SNAPSHOT') as (child, marker):
                self.assertEqual(marker, 'TEST-BEGIN-BEFORE-SNAPSHOT')
                self.sql("UPDATE public._prisma_migrations SET finished_at=clock_timestamp() "
                         "WHERE id='00000000-0000-0000-0000-000000000012';")
                out, err = child.communicate('SELECT json_build_object(' + query, timeout=20)
                self.assertEqual(child.returncode, 0, err)
                raw = json.loads(out)
                proof = seal(raw['history_context'], raw['migrations'])
                self.assertEqual(proof['row_count'], 2)
                self.assertEqual(summarize(proof)[1], [])
                self.assertNotEqual(proof['rows'][1]['finished_at'], '2026-01-01T00:00:02.123456Z')

            with observer('SELECT pg_current_snapshot();') as (child, snapshot):
                self.assertRegex(snapshot, r'^[0-9]+:[0-9]+:')
                self.sql("INSERT INTO public._prisma_migrations VALUES "
                    "('00000000-0000-0000-0000-000000000013','20260102000000_TEST_pending',repeat('b',64),"
                    "now(),NULL,NULL,0);")
                out, err = child.communicate('SELECT json_build_object(' + query, timeout=20)
                self.assertEqual(child.returncode, 0, err)
                raw = json.loads(out)
                proof = seal(raw['history_context'], raw['migrations'])
                self.assertEqual(proof['snapshot']['id'], snapshot)
                self.assertEqual(proof['row_count'], 2)
                self.assertEqual(len(proof['rows']), 2)
                self.assertEqual(summarize(proof)[1], [])
            newer = operator_database.database(Config(), Runner())
            self.assertEqual(newer['history']['row_count'], 3)
            self.assertEqual(len(newer['failed_migrations']), 1)
            self.sql('REVOKE SELECT ON public._prisma_migrations FROM fixture_observer;')
            try:
                with self.assertRaises(subprocess.CalledProcessError):
                    operator_database.database(Config(), Runner())
            finally:
                self.sql('GRANT SELECT ON public._prisma_migrations TO fixture_observer;')
            for clause in ('ENABLE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY; ALTER TABLE public._prisma_migrations FORCE ROW LEVEL SECURITY'):
                self.sql('ALTER TABLE public._prisma_migrations ' + clause + ';')
                with self.assertRaises(Denied): operator_database.database(Config(), Runner())
                self.sql('ALTER TABLE public._prisma_migrations DISABLE ROW LEVEL SECURITY; '
                         'ALTER TABLE public._prisma_migrations NO FORCE ROW LEVEL SECURITY;')
        finally:
            self.sql('ALTER TABLE public._prisma_migrations DISABLE ROW LEVEL SECURITY; '
                     'ALTER TABLE public._prisma_migrations NO FORCE ROW LEVEL SECURITY; '
                     'TRUNCATE public._prisma_migrations; INSERT INTO public._prisma_migrations '
                     "SELECT * FROM json_populate_recordset(NULL::public._prisma_migrations, '"
                     + original.replace("'", "''") + "');")


if __name__ == '__main__':
    unittest.main()
