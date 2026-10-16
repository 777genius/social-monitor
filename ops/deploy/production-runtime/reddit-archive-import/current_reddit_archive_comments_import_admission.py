"""Source-only comments recognizer. A separately qualified, sealed profile is required."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from render_guard import need

MODE = 'import-reddit-archive-comments-missing'
PROFILE = Path('/usr/local/lib/social-monitor/current-source-guard/reddit-archive-comments-qualified-partitions.json')
JOURNALS = Path('/var/lib/platform/social-monitor/collection/reddit-archive-comments-qualified-journals')
PROFILE_SHA = 'UNRENDERED_AUTHENTIC_COMMENTS_PROFILE'
FROZEN_PROFILE = None
SHA = r'[0-9a-f]{64}'
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
IDS = ['t1_pd5e1lp', 't1_pdhrwqg']
DAYS = ['2026-10-01', '2026-10-02']
CONFIG_SHA = 'e33aeab36268f4b553afd8090ccf509437a034ea70868eb5acaf1717535171c2'
SCOPE = {k: '00000000-0000-7000-8000-00000000' + n for k, n in
         zip(('tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId'),
             ('6101', '6102', '6105', '6113', '6123'))}
RAW_SHA = 'f385d4bd196c4fa91e14705062624eea63871c8e58e292ea0d7d85143b9933b1'
URL = 'https://arctic-shift.photon-reddit.com/api/comments/search?link_id=1wuktlf&limit=2'
ACQUIRED = '2026-10-16T12:58:32.860Z'
PARENT = {'sourceItemId': '9d1b26ae-ed89-41d5-aaa9-bf786b97c90c',
          'feedItemId': 'b179076b-4f9e-45d7-8d57-64346600ca90', 'externalId': 'reddit:t3_1wuktlf'}
CLAIM_FIELDS = {'mode', 'inputRoot', 'day', 'journalDir', 'semanticKey', 'planSha256', 'packetSha256', 'correlationId'}


def strict_decode(raw):
    def unique(pairs):
        value = dict(pairs)
        need(len(value) == len(pairs), 'Duplicate metadata fields')
        return value
    return json.loads(raw, object_pairs_hook=unique)


def selected(value, key):
    need(type(value) is dict and type(value.get('schemaVersion')) is int and value['schemaVersion'] == 1 and value.get('mode') == MODE
         and value.get('providerKey') == 'reddit', 'Comments profile required')
    scope = value.get('scope', {})
    need(scope == SCOPE
         and all(type(x) is str and re.fullmatch(UUID, x) for x in scope.values()), 'Complete scope required')
    need(type(value.get('image')) is str and re.fullmatch('sha256:' + SHA, value['image']), 'Qualified image required')
    parts = value.get('partitions')
    need(type(parts) is list and len(parts) == 1 and type(parts[0]) is dict, 'One finite comments partition required')
    part = parts[0]
    need(type(key) is str and re.fullmatch(SHA, key) and part.get('semanticKey') == key, 'Comments key changed')
    need(all(type(part.get(k)) is str and re.fullmatch(SHA, part[k]) for k in
             ('semanticKey', 'planSha256', 'packetSha256', 'rawSha256', 'bindingConfigSha256', 'commentsSha256')),
         'Comments digests required')
    need(part.get('day') == DAYS[0] and part.get('originalDays') == DAYS and part.get('selectedIds') == IDS
         and part.get('parent') == PARENT and part.get('rawSha256') == RAW_SHA
         and part.get('sourceUrl') == URL and part.get('acquiredAt') == ACQUIRED,
         'Exact retained identities, parent and original dates required')
    identity = part.get('identity', {})
    need(set(identity) == {'nativeParentId', 'nativeCommentIds', 'subreddit'} and
         identity['nativeParentId'] == '1wuktlf' and identity['subreddit'] == 'LocalLLaMA' and
         identity['nativeCommentIds'] == ['pdhrwqg', 'pd5e1lp'],
         'Original comment identity required')
    need(part.get('journalFilename') == f'reddit-archive-comments-qualified-{key}.journal.json', 'Comments journal changed')
    need(type(part.get('inputHostRoot')) is str and re.fullmatch(
         r'/var/lib/platform/social-monitor/reddit-archive-comments-inputs/[a-zA-Z0-9_-]{1,96}/2026-10-01',
         part['inputHostRoot']), 'Owned comments input required')
    config = value.get('bindingConfig')
    need(type(config) is str and hashlib.sha256(config.encode()).hexdigest() == part['bindingConfigSha256']
         and part['bindingConfigSha256'] == CONFIG_SHA, 'Config changed')
    config = strict_decode(config)
    passes = config.get('scanPasses', config.get('passes', []))
    need(value.get('matchedLaneOrdinal') == 6 and len(passes) >= 6 and passes[5].get('mode') == 'listing'
         and passes[5].get('listing') == 'new' and passes[5].get('subreddit') == 'LocalLLaMA'
         and passes[5].get('includeComments') is True and passes[5].get('maxCommentsPerPost') == 2
         and passes[5].get('minScore', config.get('minScore')) == 0, 'Actual configured comments pass required')
    need(value.get('scanPolicy') == {'id': scope['scanPolicyId'], 'intervalSeconds': 1800,
                                   'freshnessSeconds': 1800, 'retryBudget': 3}, 'Actual policy required')
    return part


def profile(custody):
    need(re.fullmatch(SHA, PROFILE_SHA) and FROZEN_PROFILE is not None, 'Comments profile not qualified')
    raw = custody.public(PROFILE)
    need(hashlib.sha256(raw).hexdigest() == PROFILE_SHA, 'Comments profile changed')
    value = strict_decode(raw.decode())
    need(value == FROZEN_PROFILE, 'Frozen comments profile changed')
    return value


def expected_claim(part, attempt):
    return {'mode': MODE, 'inputRoot': '/input-source/' + part['day'], 'day': part['day'],
            'journalDir': str(JOURNALS), 'semanticKey': part['semanticKey'], 'planSha256': part['planSha256'],
            'packetSha256': part['packetSha256'], 'correlationId': 'reddit-archive-comments-import-' + attempt.split('-', 1)[1]}


def validate_with_profile(value, values, pairs, attempt, until, now):
    part = selected(value, values.get('import'))
    fields = {'mode', 'date', 'artifact', 'image', 'before', 'watchdog', 'credential_deadline',
              'import', 'plan_sha256', 'claim_sha256'}
    need(re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-' + UUID, attempt) and len(values) == len(pairs)
         and set(values) == fields and values['mode'] == MODE and values['date'] == part['day']
         and values['image'] == value['image'] and values['plan_sha256'] == part['planSha256']
         and re.fullmatch(SHA, values['claim_sha256']) and re.fullmatch(r'[0-9]+,[0-9]+', values['before'])
         and values['watchdog'] == 'social-posts-wd-' + attempt.split('-', 1)[1]
         and values['credential_deadline'] == until, 'Comments intent changed')
    need(type(until) is str and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z', until), 'Finite expiry required')
    expiry = dt.datetime.fromisoformat(until.replace('Z', '+00:00')).timestamp()
    need(now + 180 <= expiry <= now + 1800, 'Finite expiry outside existing window')
    need(dt.date.fromisoformat(part['day']) < dt.datetime.fromtimestamp(now, dt.timezone.utc).date()
         and values['artifact'] == 'reddit-archive-comments-import-20261001-' + part['semanticKey'][:12] + '-' + attempt.split('-', 1)[1],
         'Comments lifecycle anchor changed')


def validate_attempt(values, pairs, attempt, until, now):
    need(FROZEN_PROFILE is not None and re.fullmatch(SHA, PROFILE_SHA), 'Comments profile not qualified')
    validate_with_profile(FROZEN_PROFILE, values, pairs, attempt, until, now)


def open_claim(r, path, raw, attempt_id):
    pairs = [field.split('=', 1) for field in raw.decode('ascii').strip().split(' ')[1:]]
    values = dict(pairs)
    if values.get('mode') != MODE:
        return
    need(raw.startswith(b'STARTED '), 'Started comments intent required')
    part = selected(profile(r.c), values['import'])
    claim = r.c.public(path / 'import-claim' / 'reddit-archive-comments-import-claim.json')
    need(len(values) == len(pairs) and hashlib.sha256(claim).hexdigest() == values['claim_sha256']
         and strict_decode(claim.decode()) == expected_claim(part, attempt_id), 'Comments claim changed')
    need(r.c.public(JOURNALS / (part['semanticKey'] + '.native-claim')) ==
         f"id={attempt_id} plan_sha256={part['planSha256']}\n".encode()
         and not os.path.lexists(JOURNALS / part['journalFilename']), 'Comments intent consumed')


def terminal_data(value, key, attempt, receipt, journal):
    part = selected(value, key)
    need(receipt == {'coverage': 'PARTIAL_ARCHIVED_OBSERVATIONS', 'planSha256': part['planSha256'],
                     'inserted': 2, 'alreadyPresent': 0, 'postWritePresent': 2}, 'Incomplete comments receipt')
    expected = {k: part[k] for k in ('semanticKey', 'planSha256', 'packetSha256', 'rawSha256', 'commentsSha256',
                                    'bindingConfigSha256', 'sourceUrl', 'acquiredAt', 'identity', 'originalDays')}
    expected.update(schemaVersion=1, kind='reddit-archive-comments', providerKey='reddit',
                    scope={**value['scope'], 'correlationId': expected_claim(part, attempt)['correlationId']},
                    candidateIds=IDS, status='complete', **receipt)
    need(journal == expected, 'Comments journal does not prove exact batch')


if __name__ == '__main__':
    # Fixed private metadata paths only. Never opens a role or performs SQL.
    import sys
    class HeldProfile:
        def public(self, path):
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                before = os.fstat(fd)
                need(stat.S_ISREG(before.st_mode) and before.st_uid == 0 and before.st_nlink == 1
                     and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size <= 65536, 'Private metadata required')
                raw = os.read(fd, 65537)
                after, named = os.fstat(fd), os.lstat(path)
                need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                     (after.st_dev, after.st_ino, len(raw), after.st_mtime_ns, after.st_ctime_ns)
                     and (before.st_dev, before.st_ino) == (named.st_dev, named.st_ino), 'Metadata changed')
                return raw
            finally:
                os.close(fd)
    need(len(sys.argv) in (2, 5), 'Comments metadata arguments required')
    value = profile(HeldProfile())
    if len(sys.argv) == 2:
        print(json.dumps(selected(value, sys.argv[1])))
    else:
        terminal_data(value, sys.argv[1], sys.argv[2], strict_decode(HeldProfile().public(Path(sys.argv[3])).decode()),
                      strict_decode(HeldProfile().public(Path(sys.argv[4])).decode()))
