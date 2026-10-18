"""Pure admission tests. Never import or execute the installed native framework."""
import copy
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('telegram_admission_under_test',
    Path(__file__).with_name('current_telegram_channel_admission.py'))
admission = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(admission)


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.now = int(dt.datetime(2026, 10, 18, 21, 0, tzinfo=dt.timezone.utc).timestamp())
        self.attempt = '20261018T210000Z-12345678-1234-4234-8234-123456789abc'
        self.until = '2026-10-18T21:10:00Z'
        self.release = {
            'version': 1, 'image': 'sha256:' + 'a' * 64,
            'sourceCommit': 'b' * 40, 'sourceTree': 'c' * 40, **admission.SCOPE,
            'sourceBindingId': '00000000-0000-7000-8000-000000006107',
            'scanPolicyId': '00000000-0000-7000-8000-000000006108',
        }
        self.raw = json.dumps(self.release).encode()
        suffix = self.attempt.split('-', 1)[1]
        self.values = {
            'mode': 'telegram-channel', 'date': '2026-10-18', 'slot': '20',
            'artifact': 'telegram-hiaimediaen-20261018-20-' + suffix,
            'image': self.release['image'], 'before': '12,34',
            'watchdog': 'social-posts-wd-' + suffix, 'credential_deadline': self.until,
            'release_sha256': hashlib.sha256(self.raw).hexdigest(),
        }

    def check(self, values=None, raw=None, now=None):
        values = self.values if values is None else values
        return admission._check_attempt(values, list(values.items()), self.attempt,
            self.until, self.now if now is None else now, self.raw if raw is None else raw)

    def test_fixed_release_and_attempt_are_accepted(self):
        self.assertEqual(self.check(), self.release)

    def test_rejects_wrong_scope_schema_and_identity(self):
        for key, value in [('channel', 'other_channel'), ('tenantId', 'wrong'),
                           ('workspaceId', 'wrong'), ('interestId', 'wrong'),
                           ('version', True), ('sourceTree', 'not-a-tree'),
                           ('sourceBindingId', '../other'), ('extra', 'field')]:
            with self.subTest(key=key):
                changed = {**self.release, key: value}
                with self.assertRaises(ValueError):
                    admission.validate_release(json.dumps(changed).encode())
        with self.assertRaises(ValueError):
            admission.validate_release(self.raw[:-1] + b', "version": 1}')

    def test_rejects_mismatched_stale_or_unbound_attempts(self):
        for key, value in [('mode', 'current'), ('date', '2026-10-17'), ('slot', '16'),
                           ('image', 'sha256:' + 'd' * 64), ('before', '-1,0'),
                           ('artifact', 'other-artifact'), ('watchdog', 'other-watchdog'),
                           ('credential_deadline', '2026-10-18T22:00:00Z'),
                           ('release_sha256', '0' * 64), ('extra', 'field')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check({**self.values, key: value})
        with self.assertRaises(ValueError):
            self.check(now=self.now + 4 * 3600)
        with self.assertRaises(ValueError):
            self.check(now=self.now - 1)
        with self.assertRaises(ValueError):
            admission._check_attempt(self.values, list(self.values.items()) + [('mode', 'telegram-channel')],
                self.attempt, self.until, self.now, self.raw)

    def test_rechecks_release_and_attempt_at_each_open_claim(self):
        path = admission.ATTEMPTS / self.attempt
        state = ('STARTED ' + ' '.join(f'{key}={value}' for key, value in self.values.items()) + '\n').encode()
        native = SimpleNamespace(public=lambda name, **_kw: state if name == path / 'state' else self.raw,
                                 now=lambda: self.now)
        route = SimpleNamespace(c=native)
        with patch.object(admission, '_release_bytes', return_value=self.raw) as read, \
             patch.object(admission.os.path, 'lexists', return_value=False):
            admission.open_claim(route, path, state, self.attempt)
            admission.open_claim(route, path, state, self.attempt)
            self.assertEqual(read.call_count, 2)
            native.public = lambda _name, **_kw: b'changed'
            with self.assertRaises(ValueError):
                admission.open_claim(route, path, state, self.attempt)
        with patch.object(admission, '_release_bytes', return_value=b'{}'), \
             patch.object(admission.os.path, 'lexists', return_value=False):
            native.public = lambda name, **_kw: state if name == path / 'state' else b'{}'
            with self.assertRaises(ValueError):
                admission.open_claim(route, path, state, self.attempt)

    def test_other_modes_never_read_the_release(self):
        with patch.object(admission, '_release_bytes', side_effect=AssertionError('must not read')):
            admission.open_claim(None, None, b'STARTED mode=current-slot\n', 'unused')

    def terminal(self, partial=False):
        started = ('STARTED ' + ' '.join(f'{key}={value}' for key, value in self.values.items()) + '\n').encode()
        state = ('COMPLETED_VALIDATED mode=telegram-channel date=2026-10-18 artifact=' + self.values['artifact'] +
                 ' collector_exit=0 exit=0 before=12,34 after=13,35 slot=20 release_sha256=' +
                 self.values['release_sha256'] + '\n').encode()
        result = {'ok': True, 'schemaVersion': 1, 'mode': 'collect', **admission.SCOPE, 'catalogReady': True,
                  'sourceBindingId': self.release['sourceBindingId'], 'scanPolicyId': self.release['scanPolicyId'],
                  'cursor': None, 'scanJobId': '00000000-0000-7000-8000-000000006109',
                  'status': 'partial' if partial else 'complete', 'fetched': 1, 'inserted': 1, 'projected': 1,
                  'skippedDuplicates': 0, 'warningCount': 1 if partial else 0, 'pageCount': 1,
                  'complete': not partial, 'backfillPending': partial, 'cursorBefore': None,
                  'cursorAfter': {'lastId': 0, 'backfillPending': True, 'beforeId': 8, 'ceilingId': 9}
                                 if partial else {'lastId': 9, 'backfillPending': False}}
        return started, state, result

    def check_terminal(self, started, state, result, role=None, proof_changes=None):
        result_raw = json.dumps(result).encode()
        proof = {'version': 1, 'attemptId': self.attempt, 'completedAt': self.now + 10,
                 'startedStateSha256': hashlib.sha256(started).hexdigest(),
                 'stateSha256': hashlib.sha256(state).hexdigest(),
                 'releaseSha256': hashlib.sha256(self.raw).hexdigest(),
                 'resultSha256': hashlib.sha256(result_raw).hexdigest(), **(proof_changes or {})}
        return admission.validate_terminal_data(self.attempt, started, state, json.dumps(proof).encode(),
            result_raw, self.raw, json.dumps(role or {'role': 'social_monitor_collection_v2', 'oid': 463883}).encode(),
            self.now + 20)

    def test_complete_and_honest_partial_terminal_results_are_accepted(self):
        for partial in (False, True):
            with self.subTest(partial=partial):
                self.assertEqual(self.check_terminal(*self.terminal(partial))['status'],
                                 'partial' if partial else 'complete')

    def test_projection_update_can_have_no_new_feed_row(self):
        started, state, result = self.terminal()
        self.check_terminal(started, state.replace(b'after=13,35', b'after=13,34'), result)

    def test_deferred_fetch_failure_requires_zero_effects_and_unchanged_checkpoint(self):
        started, state, result = self.terminal()
        state = state.replace(b'after=13,35', b'after=12,34')
        result.update(status='deferred', complete=False, backfillPending=False, cursorAfter=None,
                      deferred=True, failureStage='provider_fetch')
        for key in ('fetched', 'inserted', 'projected', 'skippedDuplicates', 'warningCount', 'pageCount'):
            result[key] = 0
        self.assertEqual(self.check_terminal(started, state, result)['status'], 'deferred')
        for prior in (None, {'lastId': 2, 'backfillPending': True, 'beforeId': 8, 'ceilingId': 9}):
            changed = {**result, 'cursor': prior, 'cursorBefore': prior, 'cursorAfter': prior,
                       'backfillPending': prior is not None}
            self.check_terminal(started, state, changed)
        for key, value in [('deferred', False), ('failureStage', 'persistence'), ('inserted', 1),
                           ('cursorAfter', {'lastId': 9, 'backfillPending': False})]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check_terminal(started, state, {**result, key: value})
        for key in ('deferred', 'failureStage'):
            changed = dict(result)
            del changed[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                self.check_terminal(started, state, changed)
        with self.assertRaises(ValueError):
            self.check_terminal(started, state.replace(b'after=12,34', b'after=13,34'), result)

    def terminal_history_gap(self):
        started, state, result = self.terminal(partial=True)
        prior = {'lastId': 2, 'backfillPending': True, 'beforeId': 8, 'ceilingId': 9}
        result.update(fetched=0, inserted=0, projected=0, pageCount=0, backfillPending=False,
                      cursor=prior, cursorBefore=prior,
                      cursorAfter={'lastId': 9, 'backfillPending': False, 'historyGap': {'afterId': 2, 'beforeId': 8}})
        return started, state.replace(b'after=13,35', b'after=12,34'), result

    def test_zero_page_pending_history_unavailability_stays_honestly_partial(self):
        started, state, result = self.terminal_history_gap()
        self.assertEqual(self.check_terminal(started, state, result)['status'], 'partial')
        merged = copy.deepcopy(result)
        merged['cursorAfter']['historyGap'] = {'afterId': 0, 'beforeId': 10}
        self.check_terminal(started, state, merged)

    def test_zero_page_history_closure_requires_prior_pending_and_covering_gap(self):
        started, state, original = self.terminal_history_gap()
        changes = [
            {'cursorAfter': {'lastId': 9, 'backfillPending': False}},
            {'cursorAfter': {'lastId': 9, 'backfillPending': False, 'historyGap': {'afterId': 3, 'beforeId': 8}}},
            {'cursorAfter': {'lastId': 9, 'backfillPending': False, 'historyGap': {'afterId': 2, 'beforeId': 7}}},
            {'cursorAfter': {'lastId': 10, 'backfillPending': False, 'historyGap': {'afterId': 2, 'beforeId': 8}}},
            {'cursor': None, 'cursorBefore': None},
            {'cursor': {'lastId': 2, 'backfillPending': False},
             'cursorBefore': {'lastId': 2, 'backfillPending': False}},
            {'backfillPending': True, 'cursorAfter': {'lastId': 2, 'backfillPending': True,
             'beforeId': 8, 'ceilingId': 9, 'historyGap': {'afterId': 2, 'beforeId': 8}}},
            {'status': 'complete', 'complete': True},
            {'fetched': 1},
            {'fetched': 1, 'inserted': 1},
            {'fetched': 1, 'projected': 1},
            {'skippedDuplicates': 1},
        ]
        for changed in changes:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.check_terminal(started, state, {**original, **changed})
        for after in (b'after=13,34', b'after=12,35'):
            with self.subTest(after=after), self.assertRaises(ValueError):
                self.check_terminal(started, state.replace(b'after=12,34', after), original)

    def test_rejects_failed_malformed_or_unbound_terminal_even_with_valid_hashes(self):
        started, state, original = self.terminal()
        for key, value in [('ok', False), ('status', 'failed'), ('complete', False), ('sourceBindingId', 'other'),
                           ('inserted', 2), ('projected', 0), ('fetched', -1), ('pageCount', 6),
                           ('cursorAfter', None), ('cursorAfter', {'lastId': 9, 'backfillPending': False, 'extra': 1}),
                           ('cursorBefore', {'lastId': 10, 'backfillPending': False}), ('extra', 'payload')]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.check_terminal(started, state, {**original, key: value})
        for old, new in [(b'COMPLETED_VALIDATED', b'FAILED_POSSIBLE_WRITES'),
                         (b'after=13,35', b'after=12,35'), (b'after=13,35', b'after=13,36'),
                         (b'before=12,34', b'before=11,34')]:
            with self.subTest(new=new), self.assertRaises(ValueError):
                self.check_terminal(started, state.replace(old, new), original)
        for changes in ({'completedAt': self.now + 600}, {'resultSha256': '0' * 64}, {'extra': 1}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.check_terminal(started, state, original, proof_changes=changes)
        with self.assertRaises(ValueError):
            self.check_terminal(started, state, original, role={'role': 'social_monitor_collection_v2', 'oid': 1})

    def test_private_file_custody_rejects_unsafe_owner_links_modes_and_type(self):
        safe = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=100)
        admission._safe_file(safe)
        for key, value in [('st_uid', 1000), ('st_nlink', 2), ('st_size', 16385),
                           ('st_mode', stat.S_IFREG | 0o644), ('st_mode', stat.S_IFLNK | 0o600)]:
            changed = copy.copy(safe)
            setattr(changed, key, value)
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                admission._safe_file(changed)


if __name__ == '__main__':
    unittest.main()
