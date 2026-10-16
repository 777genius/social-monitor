"""Offline metadata and lifecycle contracts only; no native action or external services."""
import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parent
stub = types.ModuleType('render_guard')
def need(ok, reason):
    if not ok:
        raise ValueError(reason)
stub.need = need
sys.modules['render_guard'] = stub
spec = importlib.util.spec_from_file_location('comments', ROOT / 'current_reddit_archive_comments_import_admission.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
KEY = 'a' * 64
ATTEMPT = '20261016T140000Z-00000000-0000-4000-8000-000000000001'
NOW = int(dt.datetime(2026, 10, 16, 14, tzinfo=dt.timezone.utc).timestamp())
SCRIPT = ROOT / 'social-monitor-posts-reddit-archive-comments-import.sh'


def fixture():
    # No provider text/authors, and no claim that this synthetic config is genuine retained bytes.
    config = json.dumps({'scanPasses': [{}] * 5 + [{'mode': 'listing', 'listing': 'new', 'subreddit': 'LocalLLaMA',
                         'includeComments': True, 'maxCommentsPerPost': 2, 'minScore': 0}]})
    part = dict(semanticKey=KEY, planSha256='b'*64, packetSha256='c'*64, commentsSha256='d'*64,
                bindingConfigSha256=hashlib.sha256(config.encode()).hexdigest(), rawSha256=m.RAW_SHA,
                day='2026-10-01', originalDays=['2026-10-01', '2026-10-02'], selectedIds=['t1_pd5e1lp', 't1_pdhrwqg'],
                parent=copy.deepcopy(m.PARENT), sourceUrl=m.URL, acquiredAt=m.ACQUIRED,
                identity={'nativeParentId': '1wuktlf', 'nativeCommentIds': ['pdhrwqg', 'pd5e1lp'], 'subreddit': 'LocalLLaMA'},
                inputHostRoot='/var/lib/platform/social-monitor/reddit-archive-comments-inputs/synthetic/2026-10-01',
                journalFilename=f'reddit-archive-comments-qualified-{KEY}.journal.json')
    scope = {k: f'00000000-0000-7000-8000-{n:012d}' for k, n in zip(
        ['tenantId', 'workspaceId', 'interestId', 'sourceBindingId', 'scanPolicyId'], [6101, 6102, 6105, 6113, 6123])}
    return dict(schemaVersion=1, mode=m.MODE, providerKey='reddit', image='sha256:'+'e'*64, scope=scope,
                bindingConfig=config, matchedLaneOrdinal=6, scanPolicy={'id': scope['scanPolicyId'],
                'intervalSeconds': 1800, 'freshnessSeconds': 1800, 'retryBudget': 3}, partitions=[part])


def intent(value):
    return {'mode': m.MODE, 'date': '2026-10-01', 'artifact': f'reddit-archive-comments-import-20261001-{KEY[:12]}-{ATTEMPT.split("-", 1)[1]}',
            'image': value['image'], 'before': '20,20', 'watchdog': 'social-posts-wd-'+ATTEMPT.split('-', 1)[1],
            'credential_deadline': '2026-10-16T14:30:00Z', 'import': KEY, 'plan_sha256': 'b'*64, 'claim_sha256': 'f'*64}


def completed(value):
    part = value['partitions'][0]
    receipt = dict(coverage='PARTIAL_ARCHIVED_OBSERVATIONS', planSha256='b'*64, inserted=2, alreadyPresent=0, postWritePresent=2)
    journal = {k: part[k] for k in ['semanticKey', 'planSha256', 'packetSha256', 'rawSha256', 'commentsSha256',
                                  'bindingConfigSha256', 'sourceUrl', 'acquiredAt', 'identity', 'originalDays']}
    journal.update(schemaVersion=1, kind='reddit-archive-comments', providerKey='reddit', candidateIds=['t1_pd5e1lp', 't1_pdhrwqg'],
                   scope={**value['scope'], 'correlationId': 'reddit-archive-comments-import-'+ATTEMPT.split('-', 1)[1]}, status='complete', **receipt)
    return receipt, journal


class CommentsContracts(unittest.TestCase):
    def setUp(self):
        # Synthetic config has an explicit test-only pin; production keeps the genuine digest.
        self.assertEqual(m.CONFIG_SHA, 'e33aeab36268f4b553afd8090ccf509437a034ea70868eb5acaf1717535171c2')
        pin = patch.object(m, 'CONFIG_SHA', fixture()['partitions'][0]['bindingConfigSha256'])
        pin.start(); self.addCleanup(pin.stop)

    def test_unsealed_action_refuses_before_any_native_effect(self):
        script = 'state=/nonexistent; source "$1"; reddit_comments_import_init '+KEY
        result = subprocess.run(['bash', '-c', script, 'contract', str(SCRIPT)], capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        with self.assertRaisesRegex(ValueError, 'not qualified'):
            m.validate_attempt({}, [], ATTEMPT, '', NOW)

    def test_entrypoint_and_registration_exact_flag_last_contract(self):
        registration = json.loads((ROOT / 'comments-registration.json').read_text())
        self.assertEqual(registration['cli']['arguments'], ['inputRoot', 'parentDay', 'journalDir', 'semanticKey',
                         'planSha256', 'packetSha256', 'correlationId', 'claimSha256', '--native-write'])
        for args in [[], ['bad']*6, [KEY, '2026-10-02', KEY, KEY, 'foreign', KEY]]:
            result = subprocess.run(['sh', str(ROOT/'comments-entrypoint.sh'), *args], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 78)
            self.assertEqual(result.stdout, b'')

    def test_exact_two_identity_dates_and_finite_intent(self):
        value = fixture()
        self.assertEqual(m.selected(value, KEY)['originalDays'], ['2026-10-01', '2026-10-02'])
        fields = intent(value)
        m.validate_with_profile(value, fields, list(fields.items()), ATTEMPT, fields['credential_deadline'], NOW)
        for field in ['mode', 'date', 'image', 'plan_sha256', 'watchdog', 'claim_sha256']:
            bad = {**fields, field: 'foreign'}
            with self.subTest(field=field), self.assertRaises(ValueError):
                m.validate_with_profile(value, bad, list(bad.items()), ATTEMPT, fields['credential_deadline'], NOW)
        for until in ['2026-10-16T14:02:59Z', '2026-10-16T14:30:01Z']:
            bad = {**fields, 'credential_deadline': until}
            with self.assertRaises(ValueError):
                m.validate_with_profile(value, bad, list(bad.items()), ATTEMPT, until, NOW)
        with self.assertRaises(ValueError):
            m.validate_with_profile(value, fields, list(fields.items())+[('mode', m.MODE)], ATTEMPT, fields['credential_deadline'], NOW)

    def test_profile_identity_order_matches_the_retained_packet_before_admission(self):
        value = fixture()
        value['partitions'][0]['identity']['nativeCommentIds'].reverse()
        with self.assertRaisesRegex(ValueError, 'Original comment identity required'):
            m.selected(value, KEY)

    def test_profile_rejects_post_replay_and_changed_scope_provenance_parent_dates(self):
        for field, replacement in [('selectedIds', ['reddit:t3_1wuktlf']), ('selectedIds', ['t1_pd5e1lp']*2),
              ('originalDays', ['2026-10-01']*2), ('rawSha256', 'f'*64), ('sourceUrl', m.URL+'&x=1'),
              ('parent', {**m.PARENT, 'feedItemId': 'foreign'}), ('day', '2026-10-02'), ('journalFilename', 'old-post.journal.json')]:
            value = fixture(); value['partitions'][0][field] = replacement
            with self.subTest(field=field), self.assertRaises(ValueError): m.selected(value, KEY)
        for mutate in [lambda v: v.update(mode='import-reddit-archive-missing'), lambda v: v['scope'].pop('interestId'),
                       lambda v: v['scope'].update(interestId='00000000-0000-7000-8000-000000006106'),
                       lambda v: v.update(bindingConfig='{}'),
                       lambda v: v['partitions'][0].update(bindingConfigSha256='f'*64), lambda v: v.update(matchedLaneOrdinal=1),
                       lambda v: v['scanPolicy'].update(retryBudget=4)]:
            value = fixture(); mutate(value)
            with self.assertRaises(ValueError): m.selected(value, KEY)

    def test_claim_exact_eight_fields_duplicate_denial_and_consumption(self):
        value = fixture(); part = value['partitions'][0]
        good = {'mode': m.MODE, 'inputRoot': '/input-source/2026-10-01', 'day': '2026-10-01',
                'journalDir': str(m.JOURNALS), 'semanticKey': KEY, 'planSha256': 'b'*64, 'packetSha256': 'c'*64,
                'correlationId': 'reddit-archive-comments-import-'+ATTEMPT.split('-', 1)[1]}
        self.assertEqual(set(good), m.CLAIM_FIELDS)
        for bad in [None, {**good, 'mode': 'import-reddit-archive-missing'}, {**good, 'extra': 'x'}, 'duplicate', 'consumed']:
            claim = json.dumps(good if bad in [None, 'duplicate', 'consumed'] else bad).encode()
            if bad == 'duplicate': claim = claim[:-1]+b',"day":"2026-10-01"}'
            profile_raw = json.dumps(value).encode()
            fields = intent(value); fields['claim_sha256'] = hashlib.sha256(claim).hexdigest()
            raw = ('STARTED '+' '.join(k+'='+v for k, v in fields.items())).encode()
            class Custody:
                def public(self, path):
                    if path == m.PROFILE: return profile_raw
                    if path.name.endswith('.native-claim'): return f'id={ATTEMPT} plan_sha256={part["planSha256"]}\n'.encode()
                    return claim
            owner = types.SimpleNamespace(c=Custody())
            with patch.object(m, 'PROFILE_SHA', hashlib.sha256(profile_raw).hexdigest()), patch.object(m, 'FROZEN_PROFILE', value), \
                 patch.object(m.os.path, 'lexists', return_value=bad == 'consumed'):
                if bad is None: m.open_claim(owner, Path('/synthetic'), raw, ATTEMPT)
                else:
                    with self.assertRaises(ValueError): m.open_claim(owner, Path('/synthetic'), raw, ATTEMPT)

    def test_complete_requires_exact_receipt_journal_and_immutable_original_days(self):
        value = fixture(); receipt, journal = completed(value)
        m.terminal_data(value, KEY, ATTEMPT, receipt, journal)
        for change in [{'inserted': 1}, {'alreadyPresent': 1}, {'postWritePresent': 1}, {'extra': 1}]:
            with self.assertRaises(ValueError): m.terminal_data(value, KEY, ATTEMPT, {**receipt, **change}, journal)
        for change in [{'status': 'started'}, {'originalDays': ['2026-10-01']*2}, {'candidateIds': ['t1_pd5e1lp']*2},
                       {'rawSha256': 'e'*64}, {'day': '2026-10-01'}]:
            with self.assertRaises(ValueError): m.terminal_data(value, KEY, ATTEMPT, receipt, {**journal, **change})

    def test_bounds_counts_and_unknown_previous_refuse_without_services(self):
        for name, size, accepted in [('archive.json', 4750, True), ('archive.json', 4751, False),
               ('packet.json', 65536, True), ('packet.json', 65537, False), ('packet.json', 0, False)]:
            result = subprocess.run(['bash', '-c', 'state=/nonexistent; source "$1"; reddit_comments_leaf_size_valid "$2" "$3"',
                                     'contract', str(SCRIPT), name, str(size)], capture_output=True, timeout=5)
            self.assertEqual(result.returncode == 0, accepted)
        for after, accepted in [('20,20', True), ('22,22', False), ('20,21', False), ('foreign', False)]:
            result = subprocess.run(['bash', '-c', 'state=/nonexistent; source "$1"; reddit_comments_counts_match 20,20 "$2"',
                                     'contract', str(SCRIPT), after], capture_output=True, timeout=5)
            self.assertEqual(result.returncode == 0, accepted)
        for status in ['FAILED_POSSIBLE_WRITES', 'RECOVERED_UNKNOWN', 'STARTED']:
            result = subprocess.run(['bash', '-c', 'state=/nonexistent; source "$1"; previous_fields=("$2"); reddit_comments_previous_valid /nonexistent synthetic',
                                     'contract', str(SCRIPT), status], capture_output=True, timeout=5)
            self.assertNotEqual(result.returncode, 0)

    def test_cleanup_failures_never_leave_a_completed_state(self):
        for failure in ['', 'role', 'container', 'readback', 'count', 'proof', 'watchdog']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory(prefix='TEST-comments-cleanup-') as directory:
                command = '''state=$2; source "$1"; record=$2; failure=$3
id=synthetic; name=synthetic; day=2026-10-01; artifact=synthetic; before=20,20; collector_rc=0; collector_quiesced=1
reddit_comments_key=synthetic; reddit_comments_plan_sha=synthetic; reddit_comments_claim_sha=synthetic
reddit_comments_partition_json=synthetic; reddit_comments_journal_name=synthetic; watchdog_unit=synthetic
sync() { :; }; revoke_role() { [[ $failure != role ]]; }; role_closed() { :; }
remove_container() { [[ $failure != container ]]; }; container_absent() { :; }
psql_data() { if [[ $failure == count ]]; then printf 22,22; else printf 20,20; fi; }
reddit_comments_claim_valid() { :; }; reddit_comments_terminal_data_valid() { [[ $failure != readback ]]; }
reddit_archive_completion_proof() { [[ $failure != proof ]] && printf synthetic; }
stop_watchdog() { [[ $failure != watchdog ]]; }; watchdog_inactive() { :; }
true; reddit_comments_import_cleanup'''
                result = subprocess.run(['bash', '-c', command, 'contract', str(SCRIPT), directory, failure], capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 0 if not failure else 1, result.stderr)
                saved = (Path(directory)/'state').read_text()
                self.assertTrue(saved.startswith('IMPORT_COMPLETED ' if not failure else 'FAILED_POSSIBLE_WRITES '), saved)


if __name__ == '__main__':
    unittest.main()
