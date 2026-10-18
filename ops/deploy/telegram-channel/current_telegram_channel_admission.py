"""Fixed Telegram admission data checks; no CLI, credentials or database effects."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

RELEASE = Path('/var/lib/platform/social-monitor/telegram-channel/release.json')
ATTEMPTS = Path('/var/lib/platform/social-monitor/collection/posts-once')
MODE = 'telegram-channel'
SCOPE = {
    'channel': 'hiaimediaen',
    'tenantId': '00000000-0000-7000-8000-000000006101',
    'workspaceId': '00000000-0000-7000-8000-000000006102',
    'interestId': '00000000-0000-7000-8000-000000006105',
}
RELEASE_KEYS = {'version', 'image', 'sourceCommit', 'sourceTree', *SCOPE,
                'sourceBindingId', 'scanPolicyId'}
ATTEMPT_KEYS = {'mode', 'date', 'artifact', 'image', 'before', 'watchdog',
                'credential_deadline', 'slot', 'release_sha256'}
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'


def need(condition, reason):
    if not condition:
        raise ValueError('Telegram admission: ' + reason)


def _identity(info):
    return tuple(getattr(info, name) for name in ('st_dev', 'st_ino', 'st_mode',
                 'st_uid', 'st_gid', 'st_nlink', 'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def _safe_file(info, limit=16384):
    need(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600
         and info.st_uid == 0 and info.st_nlink == 1 and 0 < info.st_size <= limit,
         'unsafe private metadata')


def _private_bytes(path, limit=16384):
    """Hold every ancestor FD and reject symlinks, rebinding and concurrent writes."""
    opened = []
    try:
        parent_fd = None
        for parent in reversed(path.parents):
            before = parent.lstat()
            need(stat.S_ISDIR(before.st_mode) and before.st_uid == 0
                 and not before.st_mode & 0o022, 'unsafe release ancestor')
            fd = os.open(str(parent) if parent_fd is None else parent.name,
                         os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            opened.append((parent, fd, _identity(before)))
            need(_identity(os.fstat(fd)) == _identity(before), 'release ancestor changed')
            parent_fd = fd
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
        before = os.fstat(fd)
        opened.append((path, fd, _identity(before)))
        _safe_file(before, limit)
        raw = os.read(fd, limit + 1)
        need(len(raw) == before.st_size, 'release size changed')
        for path, held, expected in opened:
            need(_identity(os.fstat(held)) == expected == _identity(path.lstat()),
                 'release custody changed')
        return raw
    finally:
        for _, fd, _ in reversed(opened):
            os.close(fd)


def _release_bytes():
    return _private_bytes(RELEASE)


def _unique_object(pairs):
    value = dict(pairs)
    need(len(value) == len(pairs), 'duplicate release field')
    return value


def validate_release(raw):
    need(type(raw) is bytes and 0 < len(raw) <= 16384, 'bounded release bytes required')
    release = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)
    need(type(release) is dict and set(release) == RELEASE_KEYS
         and type(release['version']) is int and release['version'] == 1,
         'release schema changed')
    need(all(release[key] == value for key, value in SCOPE.items()), 'release scope changed')
    for key, pattern in (('image', r'sha256:[0-9a-f]{64}'),
                         ('sourceCommit', r'[0-9a-f]{40}'), ('sourceTree', r'[0-9a-f]{40}'),
                         ('sourceBindingId', UUID), ('scanPolicyId', UUID)):
        need(type(release[key]) is str and re.fullmatch(pattern, release[key]),
             'release identity malformed')
    need(release['sourceBindingId'] != release['scanPolicyId'], 'release identities collide')
    return release


def _check_attempt(values, pairs, attempt, until, now, raw_release):
    need(type(values) is dict and type(pairs) is list and len(values) == len(pairs)
         and dict(pairs) == values and set(values) == ATTEMPT_KEYS
         and all(type(value) is str for value in values.values()), 'attempt fields changed')
    need(type(attempt) is str and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-' + UUID, attempt)
         and type(now) is int, 'attempt identity malformed')
    release = validate_release(raw_release)
    observed = dt.datetime.fromtimestamp(now, dt.timezone.utc)
    started = dt.datetime.strptime(attempt.split('-', 1)[0], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    slot = f'{observed.hour // 4 * 4:02d}'
    suffix = attempt.split('-', 1)[1]
    need(values['mode'] == MODE and values['date'] == observed.date().isoformat()
         and values['slot'] == slot and started.date() == observed.date()
         and started.hour // 4 == observed.hour // 4 and started.timestamp() <= now,
         'attempt date/slot changed')
    need(values['artifact'] == f'telegram-hiaimediaen-{observed:%Y%m%d}-{slot}-{suffix}'
         and values['image'] == release['image']
         and values['release_sha256'] == hashlib.sha256(raw_release).hexdigest()
         and values['watchdog'] == 'social-posts-wd-' + suffix
         and values['credential_deadline'] == until
         and re.fullmatch(r'[0-9]+,[0-9]+', values['before']), 'attempt release binding changed')
    return release


def validate_attempt(values, pairs, attempt, until, now):
    # The native caller alone validates and returns deadline_epoch(until, now).
    _check_attempt(values, pairs, attempt, until, now, _release_bytes())


def open_claim(r, path, raw, attempt):
    need(type(raw) is bytes and raw.endswith(b'\n') and raw.count(b'\n') == 1,
         'exact unopened attempt required')
    fields = raw.decode('ascii').rstrip('\n').split(' ')
    need(fields[0] == 'STARTED' and all('=' in field for field in fields[1:]),
         'attempt may already have effects')
    pairs = [field.split('=', 1) for field in fields[1:]]
    values = dict(pairs)
    if values.get('mode') != MODE:
        return
    need(type(attempt) is str and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-' + UUID, attempt),
         'attempt identity malformed')
    need(path == ATTEMPTS / attempt and r.c.public(path / 'state') == raw
         and not os.path.lexists(path / 'watchdog-fired'), 'attempt custody changed')
    release_raw = _release_bytes()
    need(r.c.public(RELEASE, limit=16384) == release_raw
         and r.c.public(path / 'release.json', limit=16384) == release_raw,
         'release changed during native read')
    _check_attempt(values, pairs, attempt, values.get('credential_deadline'), r.c.now(), release_raw)


def _state_fields(raw, status):
    need(type(raw) is bytes and raw.endswith(b'\n') and raw.count(b'\n') == 1,
         'exact state line required')
    fields = raw.decode('ascii').rstrip('\n').split(' ')
    need(fields[0] == status and all('=' in field for field in fields[1:]), 'state status changed')
    pairs = [field.split('=', 1) for field in fields[1:]]
    values = dict(pairs)
    need(len(values) == len(pairs), 'duplicate state field')
    return values, pairs


def _json(raw):
    return json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)


def _nonnegative(value):
    return type(value) is int and 0 <= value <= 9007199254740991


def _cursor(value, nullable=False):
    if value is None:
        need(nullable, 'checkpoint required')
        return
    keys = {'lastId', 'backfillPending', 'beforeId', 'ceilingId', 'retryAfterUntil', 'historyGap'}
    need(type(value) is dict and {'lastId', 'backfillPending'} <= set(value) <= keys
         and _nonnegative(value['lastId']) and type(value['backfillPending']) is bool,
         'checkpoint schema changed')
    pending = value['backfillPending']
    need(({'beforeId', 'ceilingId'} <= set(value)) if pending else
         not ({'beforeId', 'ceilingId'} & set(value)), 'checkpoint pending shape changed')
    if pending:
        need(_nonnegative(value['beforeId']) and _nonnegative(value['ceilingId'])
             and value['lastId'] < value['beforeId'] <= value['ceilingId'], 'checkpoint bounds changed')
    if 'retryAfterUntil' in value:
        need(_nonnegative(value['retryAfterUntil']), 'checkpoint retry malformed')
    if 'historyGap' in value:
        gap = value['historyGap']
        need(type(gap) is dict and set(gap) == {'afterId', 'beforeId'}
             and _nonnegative(gap['afterId']) and _nonnegative(gap['beforeId'])
             and gap['afterId'] < gap['beforeId'], 'checkpoint gap malformed')


def validate_terminal_data(attempt, started, state, proof_raw, result_raw, release_raw, role_raw, now):
    """Pure terminal contract; live role/container/watchdog checks remain mandatory."""
    values, pairs = _state_fields(started, 'STARTED')
    need(type(attempt) is str and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-' + UUID, attempt),
         'terminal attempt malformed')
    stamp = dt.datetime.strptime(attempt.split('-', 1)[0], '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc)
    start_epoch = int(stamp.timestamp())
    release = _check_attempt(values, pairs, attempt, values.get('credential_deadline'), start_epoch, release_raw)
    need(re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z',
                      values['credential_deadline']), 'terminal deadline malformed')
    until = dt.datetime.strptime(values['credential_deadline'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)
    need(0 < until.timestamp() - start_epoch <= 1800 and type(now) is int and start_epoch <= now,
         'terminal credential interval changed')
    terminal, _ = _state_fields(state, 'COMPLETED_VALIDATED')
    terminal_keys = {'mode', 'date', 'artifact', 'collector_exit', 'exit', 'before', 'after', 'slot', 'release_sha256'}
    need(set(terminal) == terminal_keys and terminal['collector_exit'] == terminal['exit'] == '0'
         and re.fullmatch(r'[0-9]+,[0-9]+', terminal['after'])
         and all(terminal[key] == values[key] for key in terminal_keys - {'collector_exit', 'exit', 'after'}),
         'terminal state changed')
    proof = _json(proof_raw)
    expected = {'version': 1, 'attemptId': attempt,
                'startedStateSha256': hashlib.sha256(started).hexdigest(),
                'stateSha256': hashlib.sha256(state).hexdigest(),
                'releaseSha256': hashlib.sha256(release_raw).hexdigest(),
                'resultSha256': hashlib.sha256(result_raw).hexdigest()}
    need(type(proof) is dict and set(proof) == {*expected, 'completedAt'}
         and type(proof['version']) is int and all(proof[key] == value for key, value in expected.items())
         and type(proof['completedAt']) is int and start_epoch <= proof['completedAt'] < until.timestamp()
         and proof['completedAt'] <= now, 'terminal proof changed')
    completed = dt.datetime.fromtimestamp(proof['completedAt'], dt.timezone.utc)
    need(completed.date() == stamp.date() and completed.hour // 4 == stamp.hour // 4,
         'terminal crossed slot')
    role = _json(role_raw)
    need(type(role) is dict and set(role) == {'role', 'oid'}
         and role['role'] == 'social_monitor_collection_v2'
         and type(role['oid']) is int and role['oid'] == 463883, 'terminal generation changed')
    result = _json(result_raw)
    need(type(result) is dict, 'collection result object required')
    deferred = result.get('status') == 'deferred'
    result_keys = {'ok', 'schemaVersion', 'mode', *SCOPE, 'catalogReady', 'sourceBindingId', 'scanPolicyId',
                   'cursor', 'scanJobId', 'status', 'fetched', 'inserted', 'projected', 'skippedDuplicates',
                   'warningCount', 'pageCount', 'complete', 'backfillPending', 'cursorBefore', 'cursorAfter'}
    if deferred:
        result_keys |= {'deferred', 'failureStage'}
    need(set(result) == result_keys and result['ok'] is True
         and type(result['schemaVersion']) is int and result['schemaVersion'] == 1
         and result['mode'] == 'collect' and result['catalogReady'] is True
         and all(result[key] == release[key] for key in {*SCOPE, 'sourceBindingId', 'scanPolicyId'})
         and type(result['scanJobId']) is str and re.fullmatch(UUID, result['scanJobId'])
         and type(result['complete']) is bool and type(result['backfillPending']) is bool
         and (result['status'] == 'deferred' if deferred else
              result['status'] == ('complete' if result['complete'] else 'partial'))
         and (not result['complete'] or not result['backfillPending'])
         and all(_nonnegative(result[key]) for key in ('fetched', 'inserted', 'projected',
                   'skippedDuplicates', 'warningCount', 'pageCount'))
         and result['fetched'] <= 50 and result['inserted'] <= result['fetched']
         and result['projected'] <= result['fetched'] and result['pageCount'] <= 5
         and (not result['complete'] or result['pageCount'] >= 1),
         'collection result changed')
    after = result['cursorAfter']
    for value in (result['cursor'], result['cursorBefore']):
        _cursor(value, nullable=True)
    _cursor(after, nullable=deferred)
    prior = result['cursorBefore']
    if deferred:
        need(result['deferred'] is True and result['failureStage'] == 'provider_fetch'
             and result['complete'] is False and after == prior
             and result['backfillPending'] == (False if prior is None else prior['backfillPending'])
             and all(result[key] == 0 for key in ('fetched', 'inserted', 'projected',
                     'skippedDuplicates', 'warningCount', 'pageCount')), 'deferred failure proof missing')
    else:
        need(after['backfillPending'] == result['backfillPending']
             and after['lastId'] >= (0 if prior is None else prior['lastId'])
             and (not result['complete'] or 'historyGap' not in after), 'terminal checkpoint inconsistent')
    need(result['cursor'] == prior, 'inspection checkpoint changed')
    before_counts = [int(value) for value in terminal['before'].split(',')]
    after_counts = [int(value) for value in terminal['after'].split(',')]
    need(all(_nonnegative(value) for value in (*before_counts, *after_counts))
         and after_counts[0] - before_counts[0] == result['inserted']
         and 0 <= after_counts[1] - before_counts[1] <= result['projected'], 'collection count delta changed')
    return {'status': result['status'], 'attemptId': attempt}


def _cli(args):
    need(os.geteuid() == 0 and Path(__file__).resolve() ==
         Path('/usr/local/lib/social-monitor/current-source-guard/current_telegram_channel_admission.py'),
         'fixed installed root validator required')
    if args == ['release']:
        raw = _release_bytes()
        return json.dumps({'release': validate_release(raw), 'release_sha256': hashlib.sha256(raw).hexdigest()},
                          sort_keys=True, separators=(',', ':'))
    need(len(args) == 2 and args[0] == 'validate-terminal'
         and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-' + UUID, args[1]), 'fixed terminal command required')
    attempt = args[1]
    path = ATTEMPTS / attempt
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700,
         'unsafe attempt directory')
    need(not any(os.path.lexists(path / name) for name in ('watchdog-fired', 'state.next',
         'terminal-proof.next', 'terminal-proof.pending')), 'terminal publication uncertain')
    validate_terminal_data(attempt, _private_bytes(path / 'started-state'), _private_bytes(path / 'state'),
        _private_bytes(path / 'terminal-proof'), _private_bytes(path / 'result.json', 65536),
        _private_bytes(path / 'release.json'), _private_bytes(path / 'generation-role'),
        int(dt.datetime.now(dt.timezone.utc).timestamp()))
    return 'TELEGRAM_TERMINAL_VALIDATED'


if __name__ == '__main__':
    try:
        print(_cli(sys.argv[1:]))
    except Exception:
        print('Telegram admission refused', file=sys.stderr)
        sys.exit(75)
