"""Fixed ACL qualification contracts and optional isolated PostgreSQL 18 proofs."""
import copy
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.parse import unquote, urlsplit

HELPER = Path(__file__).with_name('qualify-catalog-read-profile.py')


def load_helper():
    spec = importlib.util.spec_from_file_location('catalog_read_profile', HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def baseline(module):
    return {'database': module.DATABASE, 'defaultReadonly': 'on',
        'dbRoleSetting': ['default_transaction_read_only=off'],
        'role': {'oid': module.ROLE, 'name': 'social_monitor_collection_v2', 'superuser': False,
            'inherit': False, 'createRole': False, 'createDb': False, 'login': False,
            'replication': False, 'bypassRls': False, 'connectionLimit': 4,
            'config': module.ROLE_CONFIG, 'validUntil': '2000-01-01 00:00:00+00', 'expired': True},
        'memberships': [], 'table': {'oid': module.TABLE, 'name': 'capability_profiles', 'schema': 'public',
            'owner': module.OWNER, 'kind': 'r', 'rls': False, 'forceRls': False, 'acl': module.TABLE_ACL},
        'columns': [{'number': n, 'name': name, 'typeOid': oid, 'typeMod': modifier, 'notNull': True,
            'dropped': False, 'identity': '', 'generated': '', 'aclNull': True, 'acl': [], 'select': False}
            for n, name, oid, modifier in module.COLUMNS],
        'tableSelect': False, 'tableWrite': False, 'columnWrite': False,
        'sessions': 0, 'currentJobs': 0, 'sourceCount': 7, 'feedCount': 6}


CHILD = r'''
import importlib.util,json,os,pathlib,stat,sys,time
spec=importlib.util.spec_from_file_location('profile',sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sandbox=pathlib.Path(sys.argv[2]);scenario=sys.argv[3]
before=json.loads((sandbox/'before.json').read_text());after=m.qualify(before)
m.ROOT=sandbox/'record';m.LOCK=sandbox/'lock';m.EXPIRES='2100-01-01T00:00:00+00:00'
m.os.geteuid=lambda:0
original_read=pathlib.Path.read_text
def read(path,*a,**kw):
 if str(path)=='/etc/machine-id':return m.MACHINE
 assert sandbox in path.parents
 return original_read(path,*a,**kw)
pathlib.Path.read_text=read
def custody(path,mode,directory=False):
 if path==pathlib.Path(m.__file__).absolute():return path.stat()
 assert sandbox in path.parents
 info=path.lstat()
 assert stat.S_IMODE(info.st_mode)==mode
 assert stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink==1
 return info
m.custody=custody
events=[];state=before;committed=False
def command(args,text=None,timeout=30):
 global state,committed
 events.append(args)
 if args==[m.FENCE,'admit']:return 'social_monitor_collection_v2'
 if args[:2]==['/usr/bin/systemctl','show']:
  return 'LoadState=loaded\nActiveState=inactive\nSubState=dead\nJob=\nMainPID=0\nControlPID=0'
 if args[:3]==['/usr/bin/docker','ps','-a']:
  return 'social-posts-forbidden' if scenario=='active-container' else ''
 assert args[:5]==['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql']
 if text==m.profile_sql(m.ENVELOPE)+';':return json.dumps(state)
 assert (m.ROOT/'intent.json').is_file(), 'intent must precede any write transaction'
 assert text.count(m.GRANT)==1 and text.startswith('BEGIN;\nSET TRANSACTION READ WRITE;')
 committed=True;state=after
 if scenario=='commit-unknown':return ''
 if scenario=='post-commit-drift':state={**after,'sourceCount':after['sourceCount']+1}
 return 'CATALOG_READ_PROFILE_COMMITTED'
m.command=command
sys.argv=[str(pathlib.Path(m.__file__))]
error=None
try:code=m.main()
except Exception as caught:code=78;error=str(caught)
before_retry=len(events)
if scenario=='commit-unknown':
 try:m.main();raise AssertionError('uncertain commit must not retry')
 except RuntimeError:pass
 assert len(events)==before_retry
print(json.dumps({'code':code,'error':error,'committed':committed,'events':events,
 'intent':(m.ROOT/'intent.json').exists(),'receipt':(m.ROOT/'receipt.json').exists(),
 'receiptData':json.loads(original_read(m.ROOT/'receipt.json')) if (m.ROOT/'receipt.json').exists() else None}))
'''


class ReadProfileContracts(unittest.TestCase):
    def setUp(self):
        self.module = load_helper()

    def test_exact_delta_adds_only_six_non_grantable_column_selects(self):
        before = baseline(self.module)
        after = self.module.qualify(before)
        self.assertEqual(before, baseline(self.module), 'qualifier must not mutate preimage')
        changed = copy.deepcopy(after)
        for column in changed['columns']:
            self.assertEqual(column['acl'], [{'grantor': 22941, 'grantee': 463883, 'privilege': 'SELECT', 'grantable': False}])
            self.assertTrue(column['select'])
            column.update(acl=[], aclNull=True, select=False)
        self.assertEqual(changed, before)

    def test_rejects_authority_schema_future_column_and_existing_acl_drift(self):
        changes = [('defaultReadonly', 'off'), ('dbRoleSetting', []), ('memberships', [{'member': 1}]),
                   ('sessions', 1), ('currentJobs', 1), ('tableWrite', True), ('tableSelect', True)]
        for key, value in changes:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                self.module.qualify({**baseline(self.module), key: value})
        for family, key, value in [('role', 'login', True), ('role', 'oid', 1), ('role', 'expired', False),
                                   ('table', 'owner', 1), ('table', 'forceRls', True), ('table', 'acl', '{}')]:
            before = baseline(self.module)
            before[family][key] = value
            with self.subTest(family=family, key=key), self.assertRaises(RuntimeError):
                self.module.qualify(before)
        for changed in ('extra', 'type', 'acl'):
            before = baseline(self.module)
            if changed == 'extra':
                before['columns'].append({**before['columns'][0], 'number': 7, 'name': 'future_secret'})
            elif changed == 'type':
                before['columns'][0]['typeOid'] = 25
            else:
                before['columns'][0]['aclNull'] = False
            with self.subTest(changed=changed), self.assertRaises(RuntimeError):
                self.module.qualify(before)

    def run_sandbox(self, scenario='success'):
        with tempfile.TemporaryDirectory(prefix='catalog-read-profile-test-') as directory:
            root = Path(directory)
            (root / 'before.json').write_text(json.dumps(baseline(self.module)))
            lock = root / 'lock'
            lock.touch(mode=0o600)
            with lock.open('r+b') as held:
                if scenario == 'busy-lock':
                    fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
                process = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', CHILD, str(HELPER), str(root), scenario],
                    env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}, capture_output=True, text=True, timeout=20, check=False)
            self.assertEqual(process.returncode, 0, process.stderr)
            return json.loads(process.stdout.splitlines()[-1])

    def test_one_shot_success_publishes_intent_then_exact_receipt_without_new_writer_admission(self):
        result = self.run_sandbox()
        self.assertEqual(result['code'], 0, result)
        self.assertTrue(result['intent'] and result['receipt'] and result['committed'])
        self.assertFalse(result['receiptData']['businessWriterAdmission'])
        self.assertEqual(result['receiptData']['after'], self.module.qualify(baseline(self.module)))

    def test_unknown_commit_ack_keeps_intent_and_refuses_automatic_retry(self):
        result = self.run_sandbox('commit-unknown')
        self.assertEqual(result['code'], 78)
        self.assertTrue(result['committed'] and result['intent'])
        self.assertFalse(result['receipt'])

    def test_postcommit_drift_cannot_publish_success_receipt(self):
        result = self.run_sandbox('post-commit-drift')
        self.assertEqual(result['code'], 78)
        self.assertTrue(result['intent'])
        self.assertFalse(result['receipt'])

    def test_busy_lock_or_existing_collector_cannot_write_intent_or_grant(self):
        for scenario in ('busy-lock', 'active-container'):
            result = self.run_sandbox(scenario)
            with self.subTest(scenario=scenario):
                self.assertEqual(result['code'], 75 if scenario == 'busy-lock' else 78)
                self.assertFalse(result['intent'] or result['receipt'] or result['committed'])

    def test_real_pg_adapter_rejects_nonlocal_non_disposable_or_credential_urls(self):
        for value in ('postgresql://prod.example/telegram_catalog_read_profile_test_x',
                      'postgresql://localhost/telegram_catalog_read_profile_test_x',
                      'postgresql://127.0.0.1/social_monitor',
                      'postgresql://127.0.0.1/telegram_catalog_read_profile_test_x?host=prod.example',
                      'postgresql://postgres:secret@127.0.0.1/telegram_catalog_read_profile_test_x'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                sandbox_url(value)

    def test_actual_cli_bottom_preserves_normal_exit_codes(self):
        script = r'''
import ast,pathlib,sys
tree=ast.parse(pathlib.Path(sys.argv[1]).read_text())
functions=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='main']
assert len(functions)==1
functions[0].body=[ast.Return(value=ast.Constant(value=int(sys.argv[2])))]
ast.fix_missing_locations(tree)
exec(compile(tree,sys.argv[1],'exec'),{'__name__':'__main__','__file__':sys.argv[1]})
'''
        for code in (0, 75):
            process = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', script, str(HELPER), str(code)],
                env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}, capture_output=True, text=True, timeout=10, check=False)
            with self.subTest(code=code):
                self.assertEqual(process.returncode, code, process.stderr)
                self.assertEqual(process.stderr, '')


def sandbox_url(value):
    parsed = urlsplit(value)
    name = unquote(parsed.path.removeprefix('/'))
    if (parsed.scheme not in ('postgres', 'postgresql') or parsed.hostname not in ('127.0.0.1', '::1')
            or not name.startswith('telegram_catalog_read_profile_test_') or not name.replace('_', '').isalnum()
            or parsed.query or parsed.fragment or parsed.password is not None):
        raise ValueError('literal loopback and disposable catalog-read-profile database required')
    return name


@unittest.skipUnless(os.environ.get('TELEGRAM_CATALOG_READ_PROFILE_TEST_DATABASE_URL'), 'explicit isolated PG18 URL required')
class ReadProfilePostgres18(unittest.TestCase):
    @classmethod
    def query(cls, query, expect_error=False):
        process = subprocess.run(['psql', '-X', '-qAt', '--no-password', '-v', 'ON_ERROR_STOP=1', '-d', cls.url],
            input=query, capture_output=True, text=True, timeout=45, check=False,
            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C'})
        if expect_error:
            if process.returncode == 0:
                raise AssertionError('PostgreSQL accepted an invalid qualification')
            return process.stderr
        if process.returncode != 0:
            raise AssertionError('Isolated PostgreSQL fixture command failed: ' + process.stderr)
        return process.stdout.strip()

    @classmethod
    def setUpClass(cls):
        cls.url = os.environ['TELEGRAM_CATALOG_READ_PROFILE_TEST_DATABASE_URL']
        cls.name = sandbox_url(cls.url)
        if cls.query("SELECT current_setting('server_version_num')::int/10000") != '18':
            raise AssertionError('PG18 sandbox required')
        existing = cls.query("SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('social_monitor_collection_v2',"
            "'social_monitor_public_schema_owner','social_monitor_app'))+(SELECT count(*) FROM pg_class c JOIN pg_namespace n"
            " ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('capability_profiles','source_items','feed_items','scan_jobs'))")
        if existing != '0':
            raise AssertionError('Fresh isolated role/table namespace required')
        cls.query("BEGIN; SET TRANSACTION READ WRITE; CREATE ROLE social_monitor_public_schema_owner; CREATE ROLE social_monitor_app;"
            " CREATE ROLE social_monitor_collection_v2 NOLOGIN NOINHERIT NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS"
            " CONNECTION LIMIT 4 VALID UNTIL '2000-01-01'; ALTER ROLE social_monitor_collection_v2 SET search_path TO pg_catalog,public;"
            " ALTER ROLE social_monitor_collection_v2 SET idle_in_transaction_session_timeout TO '5min';"
            " ALTER ROLE social_monitor_collection_v2 SET statement_timeout TO '15min';"
            f" ALTER ROLE social_monitor_collection_v2 IN DATABASE {cls.name} SET default_transaction_read_only TO off;"
            " CREATE TABLE public.source_items(id int); CREATE TABLE public.feed_items(id int); CREATE TABLE public.scan_jobs(status text);"
            f" ALTER DATABASE {cls.name} SET default_transaction_read_only TO on; COMMIT;")

    def setUp(self):
        self.module = load_helper()
        self.query("BEGIN; SET TRANSACTION READ WRITE; DROP TABLE IF EXISTS public.capability_profiles;"
            " CREATE TABLE public.capability_profiles(id uuid NOT NULL,source_id uuid NOT NULL,version int NOT NULL,"
            "schema_version int NOT NULL DEFAULT 1,config jsonb NOT NULL,created_at timestamptz(6) NOT NULL DEFAULT now());"
            " ALTER TABLE public.capability_profiles OWNER TO social_monitor_public_schema_owner;"
            " GRANT SELECT,INSERT,UPDATE,DELETE ON public.capability_profiles TO social_monitor_app; COMMIT;")
        discovered = json.loads(self.query("SELECT json_build_object('role',(SELECT oid FROM pg_roles WHERE rolname='social_monitor_collection_v2'),"
            "'owner',(SELECT oid FROM pg_roles WHERE rolname='social_monitor_public_schema_owner'),"
            "'table','public.capability_profiles'::regclass::oid,'db',(SELECT oid FROM pg_database WHERE datname=current_database()))"))
        # PostgreSQL's oid JSON encoder emits strings; the profile uses bigint JSON numbers.
        ids = {key: int(value) for key, value in discovered.items()}
        self.module.ROLE, self.module.OWNER, self.module.TABLE = ids['role'], ids['owner'], ids['table']
        self.module.DATABASE = {'name': self.name, 'oid': ids['db']}
        self.module.sql = self.query
        self.before = self.module.observe()
        self.after = self.module.qualify(self.before)

    def test_commits_only_six_columns_and_never_future_column_table_or_grant_option_rights(self):
        answer = self.query(self.module.transaction(self.before, self.after, int(time.time()) + 60))
        self.assertEqual(answer, 'CATALOG_READ_PROFILE_COMMITTED')
        self.assertEqual(self.module.observe(), self.after)
        self.query('BEGIN; SET TRANSACTION READ WRITE; ALTER TABLE public.capability_profiles ADD COLUMN future_secret text; COMMIT;')
        privileges = json.loads(self.query(f"SELECT json_build_object('table',has_table_privilege({self.module.ROLE},"
            f"{self.module.TABLE},'SELECT'),'future',has_column_privilege({self.module.ROLE},{self.module.TABLE},7::smallint,'SELECT'),"
            f"'grantOption',has_column_privilege({self.module.ROLE},{self.module.TABLE},1::smallint,'SELECT WITH GRANT OPTION'))"))
        self.assertEqual(privileges, {'table': False, 'future': False, 'grantOption': False})

    def test_wrong_postimage_rolls_back_every_column_grant(self):
        wrong = copy.deepcopy(self.after)
        wrong['columns'][0]['select'] = False
        error = self.query(self.module.transaction(self.before, wrong, int(time.time()) + 60), expect_error=True)
        self.assertIn('six-column delta changed', error)
        self.assertEqual(self.module.observe(), self.before)

    def test_unrelated_table_grant_is_detected_inside_transaction_and_everything_rolls_back(self):
        transaction = self.module.transaction(self.before, self.after, int(time.time()) + 60)
        transaction = transaction.replace(self.module.GRANT, self.module.GRANT +
            '\nGRANT SELECT ON public.source_items TO social_monitor_collection_v2;')
        error = self.query(transaction, expect_error=True)
        self.assertIn('unrelated authority changed', error)
        self.assertEqual(self.module.observe(), self.before)
        self.assertEqual(self.query(f"SELECT has_table_privilege({self.module.ROLE},'public.source_items','SELECT')"), 'f')

    def test_stale_role_or_acl_preimage_fails_before_any_grant(self):
        stale = copy.deepcopy(self.before)
        stale['table']['acl'] = '{}'
        error = self.query(self.module.transaction(stale, self.after, int(time.time()) + 60), expect_error=True)
        self.assertIn('pre-profile changed', error)
        self.assertEqual(self.module.observe(), self.before)


if __name__ == '__main__':
    unittest.main()
