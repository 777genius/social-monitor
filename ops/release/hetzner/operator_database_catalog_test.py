"""Native PG18 ACL regression; missing Docker/root/image fails, never skips.

Red before the fix: genuine column grants and executable SECURITY DEFINER
writers pass the old predicate, but must fail production IDENTITY_SQL. One
class owns one networkless disposable container; no host/database credentials.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import unittest
import uuid

from operator_database import IDENTITY_SQL, HISTORY_SQL, HISTORY_COMPLETE_SQL

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
 finished_at timestamptz, rolled_back_at timestamptz);
INSERT INTO public._prisma_migrations VALUES
 ('1','20261002000000_finished', repeat('a',64), now(), now(), NULL),
 ('2','20261002000001_pending', repeat('b',64), now(), NULL, NULL),
 ('3','20261002000002_rolled', repeat('c',64), now(), NULL, now());
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
            HISTORY_SQL if history else 'null', HISTORY_COMPLETE_SQL if history else 'null'),
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


if __name__ == '__main__':
    unittest.main()
