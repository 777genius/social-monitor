"""Bounded native pgBackRest 2.59.1 info/repo-get proof, without cipher handling."""
import hashlib
import json
from pathlib import Path
from contract import canonical, digest, require
from operator_config import (INCLUDE_DIR, decode, exact, ini, match, private_bytes,
                             sha_bytes, uint64)
from operator_database import identity

SECTIONS = {'backrest', 'db', 'backup', 'backup:db', 'backup:option', 'backup:target',
            'target:file', 'target:file:default', 'target:link', 'target:link:default',
            'target:path', 'target:path:default', 'cipher'}
HEADERS = {
    'backrest': {'backrest-checksum', 'backrest-format', 'backrest-version'},
    'backup': {'backup-label', 'backup-prior', 'backup-reference', 'backup-type',
               'backup-timestamp-start', 'backup-timestamp-stop', 'backup-timestamp-copy-start',
               'backup-archive-start', 'backup-archive-stop', 'backup-lsn-start', 'backup-lsn-stop',
               'backup-bundle', 'backup-bundle-raw', 'backup-block-incr'},
    'backup:db': {'db-id', 'db-system-id', 'db-version', 'db-catalog-version', 'db-control-version'},
    'cipher': {'cipher-pass'},
}


def manifest(raw):
    """info.c INFO_CHECKSUM_*: ordered raw JSON values, escaped keys, SHA1.

    Deliberately do not JSON-reserialize values or sort sections/keys. The final
    repeated [backrest] containing backrest-checksum does not enter the hash.
    """
    require(type(raw) is bytes and 0 < len(raw) <= 16 * 1024**2, 'operator-manifest-size')
    checksum = hashlib.sha1()
    checksum.update(b'{')
    section, last, count, expected = None, None, 0, None
    headers, seen, groups = {}, set(), set()
    try:
        for line in raw.decode('utf-8').splitlines():
            require(len(line.encode()) <= 65536, 'operator-manifest-line')
            if not line:
                continue
            if line.startswith('[') and line.endswith(']'):
                section = line[1:-1]
                require(section in SECTIONS, 'operator-manifest-section')
                continue
            require(section is not None and '=' in line and line == line.strip(), 'operator-manifest-ini')
            key, value_raw = line.split('=', 1)
            require(key and len(key) <= 4096 and value_raw and value_raw == value_raw.strip()
                    and (section, key) not in seen, 'operator-manifest-key')
            seen.add((section, key))
            count += 1
            require(count <= 100000, 'operator-manifest-count')
            value = decode(value_raw.encode(), 65536)
            if section in ('db', 'backup:target', 'target:file', 'target:path', 'target:link'):
                require(isinstance(value, dict), 'operator-manifest-record')
            if section in HEADERS:
                require(key in HEADERS[section], 'operator-manifest-header')
                headers.setdefault(section, {})[key] = value
            if section == 'backrest' and key == 'backrest-checksum':
                require(match(r'[0-9a-f]{40}', value) and expected is None, 'operator-manifest-checksum')
                expected = value
                continue
            if section != last:
                require(section not in groups, 'operator-manifest-order')
                groups.add(section)
                checksum.update(b'},' if last is not None else b'')
                checksum.update(('"' + section + '":{').encode())
                last = section
            else:
                checksum.update(b',')
            checksum.update(json.dumps(key, ensure_ascii=False, separators=(',', ':')).encode())
            checksum.update(b':' + value_raw.encode())
        checksum.update(b'}}')
    except UnicodeError:
        require(False, 'operator-manifest-encoding')
    require(expected is not None and checksum.hexdigest() == expected, 'operator-manifest-checksum')
    backrest, backup, db = (headers.get(key, {}) for key in ('backrest', 'backup', 'backup:db'))
    require(type(backrest.get('backrest-format')) is int and backrest['backrest-format'] == 5
            and backrest.get('backrest-version') == '2.59.1'
            and match(r'[0-9]{8}-[0-9]{6}F', backup.get('backup-label'))
            and backup.get('backup-type') == 'full' and db.get('db-version') == '18'
            and type(db.get('db-id')) is int and db['db-id'] > 0, 'operator-manifest-metadata')
    start, stop = backup.get('backup-timestamp-start'), backup.get('backup-timestamp-stop')
    require(type(start) is int and type(stop) is int and 0 < start <= stop, 'operator-manifest-time')
    return {'sha256': sha_bytes(raw), 'bytes': len(raw), 'label': backup['backup-label'],
            'started_at': start, 'stop': stop, 'system_identifier': uint64(db.get('db-system-id')),
            'server_major': 18, 'database_id': db['db-id'], 'backup_type': 'full',
            'backrest_checksum': expected, 'checksum_verified': True}


def repository_identity(config):
    path = config.core['backup_identity']['config_path']
    raw = private_bytes(path)
    require(sha_bytes(raw) == config.data['backup_config_sha256'], 'operator-backup-config-changed')
    sections = ini(raw)
    require(set(sections) <= {'global', 'production-main'} and 'global' in sections,
            'operator-backup-config-sections')
    options = dict(sections['global'])
    require(not any(key.startswith('repo') for key in sections.get('production-main', {})),
            'operator-backup-repo-override')
    require(not any(key.startswith('repo') and not key.startswith('repo1-') for key in options),
            'operator-backup-other-repo')
    kind = options.get('repo1-type')
    require(kind in ('posix', 's3', 'sftp'), 'operator-repository-type')
    fields = {'posix': ('path',),
              's3': ('path', 's3-endpoint', 's3-bucket', 's3-region'),
              'sftp': ('path', 'sftp-host', 'sftp-host-user', 'sftp-host-port')}[kind]
    observed = {'type': kind}
    for field in fields:
        value = options.get('repo1-' + field)
        require(isinstance(value, str) and value and len(value) <= 4096
                and not any(c in value for c in ('\n', '\r', '\0', '$', '?', '#', '@')),
                'operator-repository-field')
        observed[field] = value
    if kind == 'sftp':
        port = observed['sftp-host-port']
        require(match(r'[1-9][0-9]{0,4}', port) and int(port) <= 65535,
                'operator-repository-port')
    require(observed['path'].startswith('/') and str(Path(observed['path'])) == observed['path']
            and '..' not in observed['path'].split('/'),
            'operator-repository-path')
    # The private config fingerprint closes other reviewed options; empty include
    # directory and cleared environment prevent untracked option sources.
    observed_id = 'repo-sha256-' + hashlib.sha256(canonical(observed)).hexdigest()
    require(observed_id == config.core['backup_identity']['repository_id'], 'operator-repository-identity')
    return observed_id, sha_bytes(raw)


def select_info(raw, config, now):
    records = decode(raw, 2 * 1024**2)
    require(isinstance(records, list) and len(records) == 1, 'operator-info-stanza')
    record = records[0]
    exact(record, ('name', 'status', 'db', 'backup', 'repo', 'cipher', 'archive'))
    require(record['name'] == config.core['backup_identity']['stanza']
            and type(record['status'].get('code')) is int and record['status']['code'] == 0,
            'operator-info-status')
    repos = record['repo']
    require(isinstance(repos, list) and len(repos) == 1 and repos[0].get('key') == 1
            and type(repos[0]['key']) is int and type(repos[0]['status'].get('code')) is int
            and repos[0]['status']['code'] == 0, 'operator-info-repo')
    dbs, backups, archives = record['db'], record['backup'], record['archive']
    require(isinstance(dbs, list) and isinstance(backups, list) and len(dbs) <= 1000
            and isinstance(archives, list) and len(archives) <= 1000
            and len(backups) <= 10000, 'operator-info-count')
    db_index = {}
    for db in dbs:
        exact(db, ('id', 'repo-key', 'system-id', 'version'))
        require(type(db['id']) is int and db['id'] > 0 and type(db['repo-key']) is int
                and db['repo-key'] == 1 and (db['id'], db['repo-key']) not in db_index,
                'operator-info-db')
        uint64(db['system-id'])
        require(match(r'[1-9][0-9]{0,2}(?:\.[0-9]{1,2})?', db['version']),
                'operator-info-db-version')
        db_index[(db['id'], db['repo-key'])] = db
    archive_keys = set()
    for archive in archives:
        exact(archive, ('database', 'id', 'min', 'max'))
        exact(archive['database'], ('id', 'repo-key'))
        dbref = archive['database']
        require(type(dbref['id']) is int and dbref['id'] > 0
                and type(dbref['repo-key']) is int and dbref['repo-key'] == 1
                and (dbref['id'], dbref['repo-key']) in db_index,
                'operator-info-archive-db-join')
        db = db_index[(dbref['id'], dbref['repo-key'])]
        require(isinstance(archive['id'], str) and len(archive['id']) <= 32
                and archive['id'] == db['version'] + '-' + str(db['id']),
                'operator-info-archive-id')
        key = (dbref['id'], dbref['repo-key'], archive['id'])
        require(key not in archive_keys, 'operator-info-archive-duplicate')
        archive_keys.add(key)
        minimum, maximum = archive['min'], archive['max']
        require((minimum is None and maximum is None)
                or (match(r'[0-9A-F]{24}', minimum) and match(r'[0-9A-F]{24}', maximum)
                    and minimum <= maximum), 'operator-info-archive-wal')
    candidates, labels = [], set()
    for item in backups:
        require(isinstance(item, dict) and set(item) <= {
            'archive', 'backrest', 'database', 'error', 'info', 'label', 'lsn', 'prior',
            'reference', 'timestamp', 'type', 'annotation'}, 'operator-info-backup')
        require(match(r'[0-9]{8}-[0-9]{6}[FDI](?:_[0-9]{8}-[0-9]{6}[DI])?', item.get('label'))
                and item['label'] not in labels and item.get('type') in ('full', 'diff', 'incr')
                and type(item.get('error')) is bool, 'operator-info-label')
        labels.add(item['label'])
        exact(item.get('database'), ('id', 'repo-key'))
        exact(item.get('timestamp'), ('start', 'stop'))
        dbref = item['database']
        require(type(dbref['id']) is int and type(dbref['repo-key']) is int
                and (dbref['id'], dbref['repo-key']) in db_index, 'operator-info-db-join')
        db = db_index[(dbref['id'], dbref['repo-key'])]
        start, stop = item['timestamp']['start'], item['timestamp']['stop']
        require(type(start) is int and type(stop) is int and 0 < start <= stop <= now,
                'operator-info-time')
        if item['type'] != 'full' or item['error'] or now - stop > config.core['backup_max_age_seconds']:
            continue
        require(match(r'[0-9]{8}-[0-9]{6}F', item['label'])
                and item['backrest'].get('version') == '2.59.1'
                and item['backrest'].get('format') == 5 and db['version'] == '18'
                and uint64(db['system-id']) == config.core['backup_identity']['system_identifier'],
                'operator-info-identity')
        candidates.append({'backup_id': item['label'], 'started_at': start, 'stop': stop,
                           'database_id': db['id'], 'repo_key': db['repo-key'],
                           'system_identifier': uint64(db['system-id'])})
    require(candidates, 'operator-info-no-full')
    candidates.sort(key=lambda item: item['stop'], reverse=True)
    require(len(candidates) == 1 or candidates[0]['stop'] != candidates[1]['stop'], 'operator-info-ambiguous')
    return candidates[0]


def backup(config, runner, binding, now):
    config.recheck()
    repo_id, config_hash = repository_identity(config)
    live = identity(config, runner)
    root = config.core['backup_identity']
    argv = [root['wrapper'], '--config=' + root['config_path'], '--stanza=' + root['stanza'],
            '--repo=' + root['repository'], '--config-include-path=' + INCLUDE_DIR,
            '--log-level-console=off', '--log-level-file=off']
    selected = select_info(runner.run(argv + ['--output=json', 'info'], limit=2 * 1024**2), config, now)
    path = 'backup/{stanza}/{backup_id}/backup.manifest'.format(**{**root, **selected})
    raw = runner.run(argv + ['repo-get', path], limit=16 * 1024**2)
    proof = {**manifest(raw), 'path': path}
    require(proof['label'] == selected['backup_id']
            and all(proof[key] == selected[key] for key in ('started_at', 'stop', 'database_id', 'system_identifier'))
            and proof['system_identifier'] == live['system_identifier'], 'operator-backup-manifest-join')
    # Re-read info after repo-get so replacement/moving info entries are denied.
    require(select_info(runner.run(argv + ['--output=json', 'info'], limit=2 * 1024**2), config, now) == selected,
            'operator-backup-info-changed')
    config.recheck()
    require(repository_identity(config) == (repo_id, config_hash), 'operator-backup-config-changed')
    artifact = {**{key: root[key] for key in ('wrapper', 'config_path', 'stanza', 'repository')},
                'config_sha256': config_hash, 'repository_id': repo_id,
                **{key: proof[key] for key in ('path', 'sha256', 'bytes')}, 'status_code': 0}
    return {**root, **selected, 'config_sha256': config_hash,
            'format': 'pgbackrest-full', 'backup_type': 'full', 'status_code': 0, 'error': False,
            'server_major': 18, 'pgbackrest_version': '2.59.1', 'completed_at': selected['stop'],
            'verified_at': now, 'receipt_digest': digest(binding), 'manifest': proof, 'repo_get': artifact,
            'reference': 'pgbackrest:{stanza}:{repository}:{backup_id}'.format(**{**root, **selected})}
