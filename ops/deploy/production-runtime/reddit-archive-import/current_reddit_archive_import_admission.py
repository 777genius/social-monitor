"""Finite Reddit archive admission. Deployment must seal an authentic profile first."""
import datetime as dt
import hashlib
import os
import re
from pathlib import Path
from render_guard import decode, need

MODE = 'import-reddit-archive-missing'
PROFILE = Path('/usr/local/lib/social-monitor/current-source-guard/reddit-archive-qualified-partitions.json')
JOURNALS = Path('/var/lib/platform/social-monitor/collection/reddit-archive-qualified-journals')
PROFILE_SHA = 'UNRENDERED_AUTHENTIC_REDDIT_PROFILE'
FROZEN_PROFILE = None
SHA = r'[0-9a-f]{64}'
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'


def selected(value, key):
    need(type(value) is dict and value.get('schemaVersion') == 1
         and value.get('providerKey') == 'reddit', 'Reddit profile required')
    scope = value.get('scope', {})
    need(set(scope) == {'tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId'}
         and all(type(x) is str and re.fullmatch(UUID, x) for x in scope.values()),
         'Complete Reddit scope required')
    need(type(value.get('image')) is str and re.fullmatch('sha256:' + SHA, value['image']),
         'Qualified Reddit image required')
    parts = value.get('partitions')
    need(type(parts) is list and 1 <= len(parts) <= 500, 'Finite Reddit partitions required')
    matches = [p for p in parts if p.get('semanticKey') == key]
    need(type(key) is str and re.fullmatch(SHA, key) and len(matches) == 1,
         'Reddit partition not admitted')
    part = matches[0]
    need(all(type(part.get(k)) is str and re.fullmatch(SHA, part[k]) for k in
             ('semanticKey', 'planSha256', 'packetSha256', 'archiveSha256',
              'bindingConfigSha256', 'itemsSha256')), 'Reddit partition hashes required')
    need(part.get('journalFilename') == f'reddit-archive-qualified-{key}.journal.json',
         'Reddit journal changed')
    ids = part.get('selectedIds')
    need(type(ids) is list and 1 <= len(ids) <= 3 and len(set(ids)) == len(ids)
         and all(type(x) is str and re.fullmatch(r'reddit:t3_[a-z0-9]{4,12}', x) for x in ids),
         'Exact Reddit source identities required')
    # Native admission pins complete genuine config and scan policy, never guesses lane6113.
    need(type(value.get('bindingConfig')) is str and bool(value['bindingConfig'])
         and type(value.get('scanPolicy')) is dict and bool(value['scanPolicy'])
         and type(value.get('matchedLaneOrdinal')) is int and value['matchedLaneOrdinal'] >= 1,
         'Actual Reddit binding config, scan policy and matched lane required')
    policy = value['scanPolicy']
    need(set(policy) == {'id', 'intervalSeconds', 'freshnessSeconds', 'retryBudget'}
         and policy['id'] == scope['scanPolicyId']
         and all(type(policy[k]) is int and (0 if k == 'retryBudget' else 1) <= policy[k] <= (100 if k == 'retryBudget' else 31536000)
                 for k in ('intervalSeconds', 'freshnessSeconds', 'retryBudget')),
         'Exact configured Reddit scan policy required')
    need(hashlib.sha256(value['bindingConfig'].encode()).hexdigest() == part['bindingConfigSha256'],
         'Reddit binding config digest changed')
    need(type(part.get('inputHostRoot')) is str and re.fullmatch(
         r'/var/lib/platform/social-monitor/reddit-archive-inputs/[a-zA-Z0-9_-]{1,96}/[0-9]{4}-[0-9]{2}-[0-9]{2}', part['inputHostRoot']),
         'Owned Reddit input root required')
    return part


def profile(custody):
    need(re.fullmatch(SHA, PROFILE_SHA), 'Reddit profile not qualified')
    raw = custody.public(PROFILE)
    need(hashlib.sha256(raw).hexdigest() == PROFILE_SHA, 'Reddit profile changed')
    return decode(raw.decode())


def validate_with_profile(value, values, pairs, attempt, until, now):
    part = selected(value, values.get('import'))
    fields = {'mode', 'date', 'artifact', 'image', 'before', 'watchdog',
              'credential_deadline', 'import', 'plan_sha256', 'claim_sha256'}
    need(len(values) == len(pairs) and set(values) == fields and values['mode'] == MODE
         and values['date'] == part['day'] and values['plan_sha256'] == part['planSha256']
         and values['image'] == value['image'] and re.fullmatch(SHA, values['claim_sha256'])
         and values['watchdog'] == 'social-posts-wd-' + attempt.split('-', 1)[1]
         and values['credential_deadline'] == until and re.fullmatch(r'[0-9]+,[0-9]+', values['before']),
         'Reddit native intent changed')
    day = dt.date.fromisoformat(part['day'])
    need(day < dt.datetime.fromtimestamp(now, dt.timezone.utc).date()
         and values['artifact'] == f"reddit-archive-import-{day:%Y%m%d}-{part['semanticKey'][:12]}-{attempt.split('-', 1)[1]}",
         'Reddit archive date or artifact changed')


def validate_attempt(values, pairs, attempt, until, now):
    need(FROZEN_PROFILE is not None, 'Reddit profile not qualified')
    validate_with_profile(FROZEN_PROFILE, values, pairs, attempt, until, now)


def open_claim(r, path, raw, attempt_id):
    pairs = [field.split('=', 1) for field in raw.decode('ascii').strip().split(' ')[1:]]
    values = dict(pairs)
    if values.get('mode') != MODE:
        return
    value = profile(r.c)
    part = selected(value, values['import'])
    claim = r.c.public(path / 'import-claim' / 'reddit-archive-import-claim.json')
    expected = {'mode': MODE, 'inputRoot': '/input-source/' + part['day'], 'day': part['day'],
                'journalDir': str(JOURNALS), 'semanticKey': part['semanticKey'],
                'planSha256': part['planSha256'], 'packetSha256': part['packetSha256'],
                'correlationId': 'reddit-archive-import-' + attempt_id.split('-', 1)[1]}
    need(len(values) == len(pairs) and hashlib.sha256(claim).hexdigest() == values['claim_sha256']
         and decode(claim.decode()) == expected, 'Reddit native claim changed')
    need(r.c.public(JOURNALS / (part['semanticKey'] + '.native-claim')) ==
         f"id={attempt_id} plan_sha256={part['planSha256']}\n".encode()
         and not os.path.lexists(JOURNALS / part['journalFilename']),
         'Reddit partition consumed or owned by another attempt')
