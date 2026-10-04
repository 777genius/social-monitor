#!/usr/bin/env python3
"""Public TEST database data and bounded source/image verification; no SQL execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

JSON_LIMIT = 4 * 1024 * 1024
SQL_LIMIT = 16 * 1024 * 1024
CUTOFF = '20260716170000_reader_summary_fail_closed_publication'
NAME = r'[0-9]{14}_[a-z0-9_]+'
HEX = r'[0-9a-f]{64}'
DIGEST = r'sha256:[0-9a-f]{64}'
BOOTSTRAP_HASHES = {
    'reader-summary-publication-pre-migration.sql':
        '1d3d70d6587ab6c232a37fb1feaa0de098dee22bf973462b824b350407c428d0',
    'reader-summary-publication-post-migration.sql':
        '231876dc900c42981985d47ac073cfce7baa46805d3e5373c9a7863a470e3233',
    'reader-summary-publication-tenant-ownership.sql':
        'cd85a07a070102cb31b5b5e3523760111a6e2bc286fa307f43348366947b9d6a'}


class Refused(Exception):
    pass


def need(condition, reason):
    if not condition:
        raise Refused(reason)


def bootstrap_hashes():
    return dict(BOOTSTRAP_HASHES)


def bootstrap_relative_path(name):
    need(name in BOOTSTRAP_HASHES, 'unknown-bootstrap')
    return ('scripts/sql/' if name.endswith('tenant-ownership.sql') else 'ops/deploy/') + name


def initial_migrations(inventory):
    return [migration for migration in inventory if migration['name'] < CUTOFF]


def roles_sql():
    return ("CREATE ROLE sm_e2e_migrator LOGIN NOSUPERUSER NOCREATEDB CREATEROLE "
            "INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; "
            "CREATE ROLE e2e_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT "
            "NOREPLICATION NOBYPASSRLS PASSWORD 'synthetic-e2e-only'; "
            "CREATE ROLE e2e_system LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT "
            "NOREPLICATION NOBYPASSRLS; CREATE ROLE social_monitor_summary_once NOLOGIN "
            "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; "
            "CREATE ROLE social_monitor_reader_summary_daily_terminal LOGIN NOSUPERUSER "
            "NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; "
            "ALTER ROLE social_monitor_reader_summary_daily_terminal SET search_path TO pg_catalog, public; "
            "GRANT social_monitor_reader_summary_daily_terminal TO sm_e2e_migrator "
            "WITH ADMIN TRUE, INHERIT FALSE, SET FALSE; "
            "GRANT e2e_api TO sm_e2e_migrator WITH ADMIN TRUE, INHERIT FALSE, SET TRUE; "
            "ALTER DATABASE e2e OWNER TO e2e_api; GRANT CREATE ON DATABASE e2e TO sm_e2e_migrator; "
            "GRANT USAGE,CREATE ON SCHEMA public TO sm_e2e_migrator;")


def historical_create_sql():
    return ('SET ROLE social_monitor_public_schema_owner; GRANT CREATE ON SCHEMA public '
            'TO social_monitor_reader_summary_publication_owner '
            'GRANTED BY social_monitor_public_schema_owner; RESET ROLE;')


def api_environment():
    # Derived from the repository runtime selectors and actual readiness surface;
    # private network, no real runtime agents, provider keys or startup writers.
    return {'NODE_ENV': 'test', 'SOCIAL_MONITOR_RUNTIME_PROFILE': 'deterministic-test',
            'DATABASE_URL': 'postgresql://e2e_api:synthetic-e2e-only@postgres:5432/e2e',
            'COLLECTOR_RUNTIME_PROFILE': 'in-memory',
            'REDIS_URL': 'redis://redis:6379/0', 'SOCIAL_MONITOR_METRICS_MODE': 'in-memory',
            'POSTGRES_RUNTIME_PROCESS': 'api-gateway',
            # All-zero TEST-only synthetic vault key.
            'SOURCE_CREDENTIAL_SECRET_ENCRYPTION_KEY': 'A' * 43 + '=',
            'MONITORING_PERSISTENCE': 'prisma', 'POSTGRES_RUNTIME_POOL_MIN': '0',
            'POSTGRES_RUNTIME_POOL_MAX': '2', 'POSTGRES_RUNTIME_POOL_CONNECTION_TIMEOUT_MS': '5000',
            'POSTGRES_RUNTIME_POOL_IDLE_TIMEOUT_MS': '10000',
            'READER_VALUE_SCORING_LOOP': 'disabled', 'INTELLIGENCE_READER_SUMMARY_JOB_LOOP': 'disabled',
            'INGESTION_SCAN_SCHEDULER_LOOP': 'disabled', 'INGESTION_SCAN_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_SUMMARY_JOB_LOOP': 'disabled', 'INTELLIGENCE_SUMMARY_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_READER_SUMMARY_QUEUE_DRAIN_LOOP': 'disabled',
            'INTELLIGENCE_AUTO_SUMMARY_SCHEDULER': 'disabled',
            'INTELLIGENCE_RELEVANCE_MEMORY_PROJECTION_LOOP': 'disabled',
            'DELIVERY_DIGEST_SCHEDULER_LOOP': 'disabled', 'DELIVERY_ATTEMPT_DISPATCH_LOOP': 'disabled',
            'DELIVERY_ATTEMPT_QUEUE_DRAIN_LOOP': 'disabled', 'DELIVERY_SUMMARY_READY_EVENT_DRAIN_LOOP': 'disabled',
            'EVENT_RELAY_LOOP': 'disabled',
            'INTELLIGENCE_SUMMARY_QUEUE_READER': 'in-memory', 'INGESTION_SCAN_QUEUE_READER': 'in-memory',
            'SUMMARY_MODEL_PROVIDER': 'deterministic', 'READER_SUMMARY_MODEL_PROVIDER': 'deterministic',
            'READER_SUMMARY_TOPIC_LABELER': 'deterministic', 'SUMMARY_MEMORY_MODE': 'disabled',
            'DELIVERY_WEBHOOK_PROVIDER': 'in-memory', 'TRUSTED_WORKSPACE_ROLE_HEADER': 'disabled'}


def trusted_ancestors(path, *, directory):
    """Check from root downward so untrusted users cannot replace checked entries."""
    trusted = {0, os.geteuid()}
    chain = list(reversed(path.parents)) + [path]
    for index, entry in enumerate(chain):
        if index == len(chain) - 1 and not directory:
            break
        info = entry.lstat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid in trusted,
             'unsafe-ancestor')
        if info.st_mode & 0o022:
            need(info.st_mode & stat.S_ISVTX
                 and index + 1 < len(chain)
                 and chain[index + 1].lstat().st_uid in trusted,
                 'unsafe-ancestor')


def canonical_path(value, *, directory=False):
    need(type(value) is str, 'path-string-required')
    path = Path(value)
    need(path.is_absolute() and str(path) == value and '..' not in path.parts,
         'noncanonical-path')
    trusted_ancestors(path, directory=directory)
    need(path == path.resolve(strict=True) and not path.is_symlink(), 'noncanonical-path')
    if directory:
        need(stat.S_ISDIR(path.lstat().st_mode), 'directory-required')
    return path


def read_regular(path, maximum):
    path = canonical_path(str(path))
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and 0 <= info.st_size <= maximum
             and info.st_uid in {0, os.geteuid()}
             and not info.st_mode & 0o022, 'unsafe-file')
        data = stream.read(maximum + 1)
        need(len(data) <= maximum and len(data) == info.st_size, 'file-size-changed')
        return data


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'duplicate-json-key')
        result[key] = value
    return result


def reject_constant(_):
    raise Refused('nonfinite-json')


def read_manifest(path):
    value = json.loads(read_regular(canonical_path(path), JSON_LIMIT),
                       object_pairs_hook=unique_object, parse_constant=reject_constant)
    fields = {'sha', 'ci_run_id', 'image_id', 'archive_sha256',
              'archive_bytes', 'migrations', 'image_graph'}
    need(type(value) is dict and set(value) == fields, 'manifest-schema')
    for field, pattern in (('sha', r'[0-9a-f]{40}'), ('ci_run_id', r'[0-9]{1,20}'),
                           ('image_id', DIGEST), ('archive_sha256', DIGEST)):
        need(type(value[field]) is str and re.fullmatch(pattern, value[field]), 'manifest-binding')
    need(type(value['archive_bytes']) is int and 0 < value['archive_bytes']
         <= 10_000_000_000, 'manifest-size')
    need(type(value['image_graph']) is dict
         and value['image_graph'].get('kind') == 'oci-manifest', 'manifest-image-graph')
    rows = value['migrations']
    need(type(rows) is list and 0 < len(rows) <= 2000, 'migration-inventory')
    for row in rows:
        need(type(row) is dict and set(row) == {'name', 'checksum'}, 'migration-schema')
        need(type(row['name']) is str and re.fullmatch(NAME, row['name'])
             and type(row['checksum']) is str and re.fullmatch(HEX, row['checksum']), 'migration-schema')
    names = [row['name'] for row in rows]
    need(names == sorted(names) and len(set(names)) == len(names), 'migration-inventory')
    return value


def inventory(root, rows):
    entries = {item.name: item for item in root.iterdir()}
    names = [row['name'] for row in rows]
    need(set(entries) in (set(names), set(names) | {'migration_lock.toml'}),
         'migration-directory-inventory')
    initial = {}
    for row in rows:
        directory = canonical_path(str(root / row['name']), directory=True)
        need({item.name for item in directory.iterdir()} == {'migration.sql'}, 'migration-file-inventory')
        data = read_regular(directory / 'migration.sql', SQL_LIMIT)
        need(hashlib.sha256(data).hexdigest() == row['checksum'], 'migration-checksum')
        if row['name'] < CUTOFF:
            initial[row['name']] = data
    lock = entries.get('migration_lock.toml')
    return initial, read_regular(lock, SQL_LIMIT) if lock is not None else None


def database_plan(manifest, source, extracted):
    manifest = read_manifest(manifest)
    source = canonical_path(source, directory=True)
    extracted = canonical_path(extracted, directory=True)
    migration_root = canonical_path(str(source / 'prisma' / 'migrations'), directory=True)
    need(not extracted.is_relative_to(source) and not source.is_relative_to(extracted),
         'input-directories-overlap')
    rows = manifest['migrations']
    first = initial_migrations(rows)
    need(len(first) == 10, 'historical-first10-required')
    source_initial, source_lock = inventory(migration_root, rows)
    image_initial, image_lock = inventory(extracted, rows)
    need(source_lock == image_lock, 'migration-lock-mismatch')
    need(source_initial == image_initial, 'initial-sql-mismatch')
    files = {}
    for name, checksum in BOOTSTRAP_HASHES.items():
        path = canonical_path(str(source / bootstrap_relative_path(name)))
        data = read_regular(path, SQL_LIMIT)
        need(hashlib.sha256(data).hexdigest() == checksum, 'canonical-bootstrap-source-mismatch')
        files[name] = str(path)
    return ({'version': 1, 'first_migrations': [row['name'] for row in first],
             'bootstrap_hashes': bootstrap_hashes(), 'bootstrap_files': files,
             'roles_sql': roles_sql(), 'historical_create_sql': historical_create_sql(),
             'api_environment': api_environment()}, image_initial, image_lock)


def write_initial(value, sql, lock, source, extracted):
    need(type(value) is str, 'initial-path')
    path = Path(value)
    need(path.is_absolute() and str(path) == value and '..' not in path.parts, 'initial-path')
    parent = canonical_path(str(path.parent), directory=True)
    info = parent.lstat()
    need(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700,
         'initial-parent-protection')
    need(not os.path.lexists(path), 'initial-exists')
    for root in (source, extracted):
        need(not path.is_relative_to(Path(root)), 'initial-input-overlap')
    path.mkdir(mode=0o755)
    path.chmod(0o755)
    for name, data in sql.items():
        directory = path / name
        directory.mkdir(mode=0o755)
        directory.chmod(0o755)
        with (directory / 'migration.sql').open('xb') as stream:
            stream.write(data)
        (directory / 'migration.sql').chmod(0o444)
    if lock is not None:
        with (path / 'migration_lock.toml').open('xb') as stream:
            stream.write(lock)
        (path / 'migration_lock.toml').chmod(0o444)


def main():
    parser = argparse.ArgumentParser(description='Public TEST database plan; no database execution.')
    for option in ('manifest', 'source', 'extracted', 'initial'):
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args()
    try:
        answer, sql, lock = database_plan(args.manifest, args.source, args.extracted)
        write_initial(args.initial, sql, lock, args.source, args.extracted)
        print(json.dumps(answer, sort_keys=True, separators=(',', ':'), allow_nan=False))
    except Exception as error:
        reason = str(error) if isinstance(error, Refused) else 'database-plan-failed'
        print(reason, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
