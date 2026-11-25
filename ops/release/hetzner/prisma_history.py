"""Finite v1 full-history proof. Pure policy; no SQL, files or observer authority.

The digest binds bytes, not visibility or database effects. The trusted observer
must collect the unfiltered relation, identity and catalogs in one snapshot.
"""
from datetime import datetime, timezone
import re
from contract import digest, require

FIELDS = {'version', 'system_identifier', 'database', 'observer_role', 'port',
          'relation', 'snapshot', 'visibility', 'observed_at', 'row_count', 'rows', 'sha256'}
ROW_FIELDS = {'id', 'name', 'checksum', 'started_at', 'finished_at', 'rolled_back_at',
              'applied_steps_count'}
SUMMARY = ('name', 'checksum', 'finished_at', 'rolled_back_at')
LIMIT = 10000


def shape(value, fields):
    require(type(value) is dict and set(value) == set(fields), 'history-shape')


def matches(pattern, value):
    return type(value) is str and re.fullmatch(pattern, value, flags=re.ASCII) is not None


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def timestamp(value):
    require(matches(r'[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}'
                    r'(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}(?::[0-9]{2})?)', value), 'history-time')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(parsed.tzinfo is not None, 'history-time')
        return parsed.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        require(False, 'history-time')


def utc(value):
    return timestamp(value).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def seal(context, rows):
    """Producer normalization only; core validates the exact canonical proof bytes."""
    shape(context, FIELDS - {'rows', 'sha256'})
    require(type(rows) is list and len(rows) <= LIMIT, 'history-count')
    normalized = []
    for row in rows:
        shape(row, ROW_FIELDS)
        require(type(row['name']) is str and type(row['id']) is str, 'history-row')
        normalized.append({**row, **{key: utc(row[key]) if row[key] is not None else None
            for key in ('started_at', 'finished_at', 'rolled_back_at')}})
    normalized.sort(key=lambda r: (r['name'], r['started_at'] or '', r['id']))
    body = {**context, 'observed_at': utc(context['observed_at']), 'rows': normalized}
    proof = {**body, 'sha256': digest(body)}
    summarize(proof)
    return proof


def summarize(proof):
    """Validate proof and derive successes/unresolved groups, never discard attempts."""
    shape(proof, FIELDS)
    require(integer(proof['version'], 1, 1), 'history-version')
    require(matches(r'sha256:[0-9a-f]{64}', proof['sha256']) and proof['sha256'] == digest(
        {k: v for k, v in proof.items() if k != 'sha256'}), 'history-digest')
    require(matches(r'[1-9][0-9]{0,19}', proof['system_identifier'])
            and int(proof['system_identifier']) < 2**64
            and all(matches(r'[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,62}', proof[k])
                    for k in ('database', 'observer_role'))
            and matches(r'[1-9][0-9]{0,4}', proof['port']) and int(proof['port']) <= 65535,
            'history-identity')
    relation, snapshot, visibility = (proof[k] for k in ('relation', 'snapshot', 'visibility'))
    shape(relation, ('schema', 'name', 'oid', 'kind'))
    require(relation['schema'] == 'public' and relation['name'] == '_prisma_migrations'
            and relation['kind'] == 'r' and integer(relation['oid'], 1, 2**32 - 1), 'history-relation')
    shape(snapshot, ('id', 'isolation', 'read_only'))
    require(snapshot['isolation'] == 'repeatable read' and snapshot['read_only'] is True
            and matches(r'[0-9]{1,20}:[0-9]{1,20}:(?:[0-9]{1,20}(?:,[0-9]{1,20})*)?', snapshot['id']),
            'history-snapshot')
    low, high, active = snapshot['id'].split(':')
    low, high = int(low), int(high)
    active = [int(v) for v in active.split(',')] if active else []
    require(0 <= low <= high < 2**64 and active == sorted(set(active))
            and all(low <= v < high for v in active), 'history-snapshot')
    shape(visibility, ('complete', 'select', 'rls_enabled', 'rls_forced'))
    require(visibility['complete'] is True and visibility['select'] is True
            and visibility['rls_enabled'] is False and visibility['rls_forced'] is False,
            'history-visibility')
    observed = timestamp(proof['observed_at'])
    require(utc(proof['observed_at']) == proof['observed_at'], 'history-time-canonical')
    rows = proof['rows']
    require(type(rows) is list and integer(proof['row_count'], 0, LIMIT)
            and proof['row_count'] == len(rows), 'history-count')
    groups, ids, ordering = {}, set(), []
    for row in rows:
        shape(row, ROW_FIELDS)
        require(matches(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', row['id'])
                and row['id'] not in ids
                and matches(r'[0-9]{14}_[a-zA-Z0-9_-]{1,180}', row['name'])
                and matches(r'[0-9a-f]{64}', row['checksum'])
                and integer(row['applied_steps_count'], 0, 2**31 - 1), 'history-row')
        ids.add(row['id'])
        require(row['started_at'] is not None, 'history-start')
        times = {key: timestamp(row[key]) for key in
                 ('started_at', 'finished_at', 'rolled_back_at') if row[key] is not None}
        require(all(utc(row[k]) == row[k] for k in times), 'history-time-canonical')
        require(all(times['started_at'] <= t <= observed for t in times.values())
                and not ('finished_at' in times and 'rolled_back_at' in times), 'database-evidence')
        ordering.append((row['name'], row['started_at'], row['id']))
        groups.setdefault(row['name'], []).append(row)
    require(ordering == sorted(ordering), 'history-order')
    applied, failed = [], []
    for attempts in groups.values():
        successes = [r for r in attempts if r['finished_at'] is not None and r['rolled_back_at'] is None]
        valid = (len(successes) == 1 and successes[0] is attempts[-1]
                 and all(r['checksum'] == attempts[-1]['checksum'] for r in attempts)
                 and all(r['finished_at'] is None and r['rolled_back_at'] is not None
                         and timestamp(r['rolled_back_at']) < timestamp(n['started_at'])
                         for r, n in zip(attempts, attempts[1:])))
        if valid:
            applied.append({k: attempts[-1][k] for k in SUMMARY})
        else:
            failed.extend({k: row[k] for k in SUMMARY} for row in attempts)
    return applied, failed
