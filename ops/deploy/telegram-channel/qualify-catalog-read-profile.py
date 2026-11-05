"""One-shot fixed six-column READ ACL qualification; never a business writer gate.

No old mutation phase/receipt is reused and no backup is created or qualified.
The existing native prewrite backup remains mandatory for actual collection.
An intent without completion is COMMIT-UNKNOWN: preserve it, never auto-retry.
"""
import copy
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

MACHINE = 'b28fc7b17042414386eb9b114046e50c'
ROOT = Path('/var/lib/platform/social-monitor/telegram-capability-read-profile-20261019')
LOCK = Path('/var/lib/platform/social-monitor/collection/.posts-once.lock')
FENCE = '/usr/local/sbin/social-monitor-posts-generation-fence'
EXPIRES = '2026-10-19T02:00:00+00:00'
ROLE = 463883
OWNER = 22941
TABLE = 21668
DATABASE = {'name': 'social_monitor', 'oid': 21368}
COLUMNS = [(1, 'id', 2950, -1), (2, 'source_id', 2950, -1), (3, 'version', 23, -1),
           (4, 'schema_version', 23, -1), (5, 'config', 3802, -1), (6, 'created_at', 1184, 6)]
TABLE_ACL = '{social_monitor_public_schema_owner=arwdDxtm/social_monitor_public_schema_owner,social_monitor_app=arwd/social_monitor_public_schema_owner}'
ROLE_CONFIG = ['search_path=pg_catalog, public', 'idle_in_transaction_session_timeout=5min', 'statement_timeout=15min']
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
GRANT = ('GRANT SELECT (id, source_id, version, schema_version, config, created_at) '
         'ON TABLE public.capability_profiles TO social_monitor_collection_v2;')
ENVELOPE = r"""SELECT jsonb_build_object(
 'database', jsonb_build_object('name',d.datname,'oid',d.oid::bigint),
 'defaultReadonly',current_setting('default_transaction_read_only'),
 'dbRoleSetting',COALESCE((SELECT to_jsonb(s.setconfig) FROM pg_db_role_setting s
  WHERE s.setrole=463883 AND s.setdatabase=21368),'null'::jsonb),
 'role',jsonb_build_object('oid',r.oid::bigint,'name',r.rolname,'superuser',r.rolsuper,
  'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'login',r.rolcanlogin,
  'replication',r.rolreplication,'bypassRls',r.rolbypassrls,'connectionLimit',r.rolconnlimit,
  'validUntil',r.rolvaliduntil::text,'expired',r.rolvaliduntil<clock_timestamp(),'config',r.rolconfig),
 'memberships',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member)
  FROM pg_auth_members m WHERE m.member=463883 OR m.roleid=463883),'[]'::jsonb),
 'table',jsonb_build_object('oid',c.oid::bigint,'name',c.relname,'schema',n.nspname,
  'owner',c.relowner::bigint,'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'acl',c.relacl::text),
 'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
   'typeOid',a.atttypid::bigint,'typeMod',a.atttypmod,'notNull',a.attnotnull,'dropped',a.attisdropped,
   'identity',a.attidentity,'generated',a.attgenerated,'aclNull',a.attacl IS NULL,
   'acl',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantor',x.grantor::bigint,
    'grantee',x.grantee::bigint,'privilege',x.privilege_type,'grantable',x.is_grantable)
    ORDER BY x.grantor,x.grantee,x.privilege_type,x.is_grantable)
    FROM aclexplode(a.attacl) x),'[]'::jsonb),
   'select',has_column_privilege(463883,21668,a.attnum,'SELECT')) ORDER BY a.attnum)
   FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),'[]'::jsonb),
 'tableSelect',has_table_privilege(463883,21668,'SELECT'),
 'tableWrite',has_table_privilege(463883,21668,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
 'columnWrite',has_any_column_privilege(463883,21668,'INSERT,UPDATE,REFERENCES'),
 'sessions',(SELECT count(*) FROM pg_stat_activity WHERE usesysid=463883),
 'currentJobs',(SELECT count(*) FROM public.scan_jobs WHERE status::text IN ('REQUESTED','ENQUEUED')),
 'sourceCount',(SELECT count(*) FROM public.source_items),
 'feedCount',(SELECT count(*) FROM public.feed_items))
FROM pg_database d CROSS JOIN pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE d.datname=current_database() AND r.oid=463883 AND c.oid=21668"""
# Passwords/hashes stay in server-local variables. This value is NEVER returned.
UNRELATED = r"""SELECT jsonb_build_object(
 'auth',(SELECT jsonb_agg(to_jsonb(a) ORDER BY oid) FROM pg_authid a),
 'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m),
 'settings',(SELECT jsonb_agg(to_jsonb(s) ORDER BY setdatabase,setrole) FROM pg_db_role_setting s),
 'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_class c),
 'attributes',(SELECT jsonb_agg(CASE WHEN attrelid=21668 AND attnum BETWEEN 1 AND 6
   THEN to_jsonb(a)-'attacl' ELSE to_jsonb(a) END ORDER BY attrelid,attnum) FROM pg_attribute a),
 'routines',(SELECT jsonb_agg(jsonb_build_array(oid,proowner,proacl::text) ORDER BY oid) FROM pg_proc),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(oid,nspowner,nspacl::text) ORDER BY oid) FROM pg_namespace),
 'databases',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_database d),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d),
 'types',(SELECT jsonb_agg(jsonb_build_array(oid,typowner,typacl::text) ORDER BY oid) FROM pg_type),
 'languages',(SELECT jsonb_agg(jsonb_build_array(oid,lanowner,lanacl::text) ORDER BY oid) FROM pg_language),
 'servers',(SELECT jsonb_agg(jsonb_build_array(oid,srvowner,srvacl::text) ORDER BY oid) FROM pg_foreign_server),
 'wrappers',(SELECT jsonb_agg(jsonb_build_array(oid,fdwowner,fdwacl::text) ORDER BY oid) FROM pg_foreign_data_wrapper),
 'tablespaces',(SELECT jsonb_agg(jsonb_build_array(oid,spcowner,spcacl::text) ORDER BY oid) FROM pg_tablespace),
 'parameters',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_parameter_acl p),
 'largeobjects',(SELECT jsonb_agg(jsonb_build_array(oid,lomowner,lomacl::text) ORDER BY oid) FROM pg_largeobject_metadata))"""
CATALOG_LOCKS = ('pg_authid, pg_auth_members, pg_db_role_setting, pg_class, pg_attribute, pg_proc, '
                 'pg_namespace, pg_database, pg_default_acl, pg_type, pg_language, pg_foreign_server, '
                 'pg_foreign_data_wrapper, pg_tablespace, pg_parameter_acl, pg_largeobject_metadata')


class ProfileRefused(RuntimeError):
    """Only fixed, non-sensitive refusal reasons may leave this helper."""


def need(value, reason):
    if not value:
        raise ProfileRefused(reason)


def custody(path, mode, directory=False):
    for parent in path.parents:
        info = parent.lstat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
             and not info.st_mode & 0o022, 'unsafe ancestor')
    info = path.lstat()
    need(info.st_uid == info.st_gid == 0 and stat.S_IMODE(info.st_mode) == mode
         and (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1),
         'unsafe profile custody')
    return info


def command(args, text=None, timeout=30):
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=ENV, pass_fds=(9,), start_new_session=True)
    try:
        stdout, _ = process.communicate(text, timeout=timeout)
        need(process.returncode == 0 and len(stdout) <= 262144, 'fixed native command refused')
        return stdout.strip()
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        raise


def sql(query):
    return command(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/psql', '-X', '-qAt',
                    '--no-password', '-v', 'ON_ERROR_STOP=1', '-h', '/var/run/postgresql', '-p', '5432',
                    '-U', 'postgres', '-d', 'social_monitor'], query, timeout=45)


def observe():
    return json.loads(sql(profile_sql(ENVELOPE) + ';'))


def profile_sql(query):
    # Constants are fixed in production; isolated PG tests inject their own OIDs.
    return query.replace('463883', str(ROLE)).replace('21668', str(TABLE)).replace('21368', str(DATABASE['oid']))


def qualify(before):
    need(before['database'] == DATABASE and before['defaultReadonly'] == 'on'
         and before['dbRoleSetting'] == ['default_transaction_read_only=off'], 'database profile changed')
    role = before['role']
    need({k: v for k, v in role.items() if k not in ('validUntil', 'expired')} == {
        'oid': ROLE, 'name': 'social_monitor_collection_v2', 'superuser': False, 'inherit': False,
        'createRole': False, 'createDb': False, 'login': False, 'replication': False, 'bypassRls': False,
        'connectionLimit': 4, 'config': ROLE_CONFIG} and role['expired'] is True and role['validUntil'] is not None,
        'closed role profile changed')
    need(before['memberships'] == [] and before['sessions'] == before['currentJobs'] == 0,
         'active collection or membership changed')
    need(before['table'] == {'oid': TABLE, 'name': 'capability_profiles', 'schema': 'public', 'owner': OWNER,
         'kind': 'r', 'rls': False, 'forceRls': False, 'acl': TABLE_ACL}, 'catalog table profile changed')
    expected_columns = [{'number': number, 'name': name, 'typeOid': oid, 'typeMod': modifier,
                         'notNull': True, 'dropped': False, 'identity': '', 'generated': '', 'aclNull': True, 'acl': [], 'select': False}
                        for number, name, oid, modifier in COLUMNS]
    need(before['columns'] == expected_columns and before['tableSelect'] is False
         and before['tableWrite'] is False and before['columnWrite'] is False, 'column privilege profile changed')
    need(all(type(before[key]) is int and before[key] >= 0 for key in ('sourceCount', 'feedCount')), 'invalid row counts')
    after = copy.deepcopy(before)
    for column in after['columns']:
        column['acl'] = [{'grantor': OWNER, 'grantee': ROLE, 'privilege': 'SELECT', 'grantable': False}]
        column['aclNull'] = False
        column['select'] = True
    return after


def literal(value):
    return "'" + json.dumps(value, separators=(',', ':')).replace("'", "''") + "'::jsonb"


def transaction(before, after, deadline):
    # All authoritative comparisons occur again under locks, before COMMIT.
    return f"""BEGIN;
SET TRANSACTION READ WRITE;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
LOCK TABLE {CATALOG_LOCKS} IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.capability_profiles, public.source_items, public.feed_items IN SHARE ROW EXCLUSIVE MODE;
DO $qualification$
DECLARE observed jsonb; unrelated_before jsonb; unrelated_after jsonb;
BEGIN
 IF clock_timestamp() >= to_timestamp({deadline}) THEN RAISE EXCEPTION 'qualification expired'; END IF;
 SELECT ({profile_sql(ENVELOPE)}) INTO observed;
 IF observed IS DISTINCT FROM {literal(before)} THEN RAISE EXCEPTION 'pre-profile changed'; END IF;
 SELECT ({profile_sql(UNRELATED)}) INTO unrelated_before;
 {GRANT}
 SELECT ({profile_sql(ENVELOPE)}) INTO observed;
 IF observed IS DISTINCT FROM {literal(after)} THEN RAISE EXCEPTION 'six-column delta changed'; END IF;
 SELECT ({profile_sql(UNRELATED)}) INTO unrelated_after;
 IF unrelated_after IS DISTINCT FROM unrelated_before THEN RAISE EXCEPTION 'unrelated authority changed'; END IF;
 IF clock_timestamp() >= to_timestamp({deadline}) THEN RAISE EXCEPTION 'qualification expired'; END IF;
END $qualification$;
COMMIT;
SELECT 'CATALOG_READ_PROFILE_COMMITTED';
"""


def units_quiet():
    for unit in ('social-monitor-posts-auto-current.service', 'social-monitor-telegram-channel.service'):
        raw = command(['/usr/bin/systemctl', 'show', unit, '--property=LoadState,ActiveState,SubState,Job,MainPID,ControlPID'])
        fields = dict(line.split('=', 1) for line in raw.splitlines())
        need(fields == {'LoadState': 'loaded', 'ActiveState': 'inactive', 'SubState': 'dead', 'Job': '', 'MainPID': '0', 'ControlPID': '0'}
             or fields == {'LoadState': 'loaded', 'ActiveState': 'inactive', 'SubState': 'dead', 'Job': '0', 'MainPID': '0', 'ControlPID': '0'},
             'native collection unit not quiet')
    names = command(['/usr/bin/docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
    need(not any(name.startswith('social-posts-') for name in names), 'native collector container present')


def admit():
    need(command([FENCE, 'admit'], timeout=90) == 'social_monitor_collection_v2', 'native admission refused')


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def publish(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, sort_keys=True, separators=(',', ':'))
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    sync_directory(path.parent)


def main():
    need(len(sys.argv) == 1 and os.geteuid() == 0 and Path('/etc/machine-id').read_text().strip() == MACHINE,
         'fixed production root invocation required')
    custody(Path(__file__).absolute(), 0o600)
    os.umask(0o077)
    expiry = dt.datetime.fromisoformat(EXPIRES).timestamp()
    need(time.time() < expiry, 'fixed qualification window expired')
    initial = custody(LOCK, 0o600)
    fd = os.open(LOCK, os.O_RDWR | os.O_NOFOLLOW)
    if fd != 9:
        os.dup2(fd, 9)
        os.close(fd)
    try:
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 75
    need((os.fstat(9).st_dev, os.fstat(9).st_ino) == (initial.st_dev, initial.st_ino)
         == (LOCK.lstat().st_dev, LOCK.lstat().st_ino), 'native lock rebound')
    if os.path.lexists(ROOT):
        custody(ROOT, 0o700, True)
        need(not any(ROOT.iterdir()), 'one-shot intent exists; preserve commit uncertainty')
    admit()
    units_quiet()
    before = observe()
    after = qualify(before)
    deadline = min(int(time.time()) + 120, int(expiry))
    need(time.time() < deadline, 'qualification window expired before intent')
    if not ROOT.exists():
        ROOT.mkdir(mode=0o700)
        sync_directory(ROOT.parent)
    intent = {'version': 1, 'profile': 'telegram-capability-six-column-read-20261019', 'before': before,
              'expectedAfter': after, 'deadline': deadline, 'businessWriterAdmission': False,
              'helperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'lockIdentity': {'dev': initial.st_dev, 'ino': initial.st_ino},
              'backup': 'not-qualified-by-this-read-acl-profile; existing collection prewrite unchanged'}
    publish(ROOT / 'intent.json', intent)
    units_quiet()
    need(sql(transaction(before, after, deadline)) == 'CATALOG_READ_PROFILE_COMMITTED',
         'commit acknowledgement uncertain; preserve intent')
    need(observe() == after, 'post-commit profile differs; preserve intent')
    units_quiet()
    admit()
    need(observe() == after, 'post-admission profile differs; preserve intent')
    publish(ROOT / 'receipt.json', {**intent, 'status': 'QUALIFIED_SIX_COLUMN_SELECT_ONLY',
            'after': after, 'unrelatedAuthorityUnchangedInsideTransaction': True,
            'completedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
    print(json.dumps({'status': 'QUALIFIED_SIX_COLUMN_SELECT_ONLY', 'receipt': str(ROOT / 'receipt.json')}))
    return 0


if __name__ == '__main__':
    try:
        result = main()
    except BaseException as error:
        reason = str(error) if isinstance(error, ProfileRefused) else type(error).__name__
        print('Catalog read profile refused: ' + reason + '; preserve any intent and inspect without retry', file=sys.stderr)
        sys.exit(78)
    else:
        sys.exit(result)
