"""Nearest core boundary regressions. Mutations are rehashed unless testing digest.

Red triggers: summary-only evidence trusts missing/forged history, ignores retry
ordering and observer binding, and loses the rolled attempts it must retain.
"""
import copy
import time
import unittest
from contract import Denied, digest
import evidence
from prisma_history import seal, summarize
from test_support import history_context

NAME = '20261002000000_test'
ROW = {'id': '00000000-0000-0000-0000-000000000001', 'name': NAME, 'checksum': 'a' * 64,
       'started_at': '2026-01-01T00:00:00.123456Z', 'finished_at': '2026-01-01T00:00:03.123456Z',
       'rolled_back_at': None, 'applied_steps_count': 0}
INVENTORY = [{'name': NAME, 'checksum': ROW['checksum']}]


def observation(retry=True):
    rows = [copy.deepcopy(ROW)]
    if retry:
        rows.insert(0, {**ROW, 'id': '00000000-0000-0000-0000-000000000002',
                       'finished_at': None, 'rolled_back_at': '2026-01-01T00:00:01.123456Z'})
        rows[1]['started_at'] = '2026-01-01T00:00:01.123457Z'
    context = history_context(rows)
    proof = seal(context, rows)
    applied, failed = summarize(proof)
    return {'version': 1, 'observed_at': int(time.time()), 'server_major': 18,
            'read_only_role': True, 'transaction_read_only': True,
            **{k: proof[k] for k in ('system_identifier', 'database', 'observer_role', 'port')},
            'history': proof, 'applied_migrations': applied, 'failed_migrations': failed}


def rehash(value):
    proof = value['history']
    proof['sha256'] = digest({k: v for k, v in proof.items() if k != 'sha256'})


class HistoryPolicyTests(unittest.TestCase):
    def admit(self, value, inventory=INVENTORY):
        return evidence.database(value, inventory, '1111111111111111111')

    def test_clean_and_resolved_zero_step_history_retain_every_attempt(self):
        for retry in (False, True):
            value = observation(retry)
            admitted = self.admit(value)
            self.assertEqual(admitted['history'], value['history'])
            self.assertEqual(len(admitted['history']['rows']), 2 if retry else 1)
            self.assertEqual(value['failed_migrations'], [])
            self.assertEqual(len(value['applied_migrations']), 1)
        rows = [{**ROW, 'started_at': '2026-01-01T01:00:00.123456+01:00'}]
        proof = seal(history_context(rows), rows)
        self.assertEqual(proof['rows'][0]['started_at'], ROW['started_at'])

    def test_every_rolled_predecessor_requires_a_strict_retry_boundary(self):
        value = observation()
        rows = value['history']['rows']
        rows[0]['rolled_back_at'] = '2026-01-01T00:00:00.500000Z'
        rows.insert(1, {**rows[0], 'id': '00000000-0000-0000-0000-000000000003',
                       'started_at': '2026-01-01T00:00:00.600000Z',
                       'rolled_back_at': '2026-01-01T00:00:01.123456Z', 'applied_steps_count': 7})
        value['history']['row_count'] = 3; rehash(value)
        self.assertEqual(len(self.admit(value)['history']['rows']), 3)
        rows[1]['rolled_back_at'] = rows[2]['started_at']; rehash(value)
        with self.assertRaises(Denied): self.admit(value)

    def test_missing_proof_cannot_fall_back_to_success_summaries(self):
        value = observation(); del value['history']
        with self.assertRaisesRegex(Denied, 'history-shape'): self.admit(value)

    def test_rehashed_malformed_attempts_deny_at_core(self):
        # Each previously ignored field/type can otherwise hide an ambiguous attempt.
        mutations = [
            {'id': 'not-uuid'}, {'id': True}, {'name': '../outside'}, {'checksum': 'F' * 64},
            {'applied_steps_count': True}, {'applied_steps_count': -1}, {'applied_steps_count': 1.0},
            {'applied_steps_count': 2**31}, {'started_at': None}, {'started_at': '2026-01-01T00:00:00'},
            {'started_at': '2026-02-30T00:00:00.000000Z'}, {'finished_at': False},
            {'finished_at': '2025-01-01T00:00:00.000000Z'},
            {'rolled_back_at': '2026-01-01T00:00:04.000000Z'},
            {'finished_at': '9999-01-01T00:00:00.000000Z'},
            {'started_at': '2026-01-01T01:00:00.123456+01:00'}, {'extra': 'unknown'}]
        for change in mutations:
            with self.subTest(change=change):
                value = observation(False); value['history']['rows'][0].update(change); rehash(value)
                with self.assertRaises(Denied): self.admit(value)
        for key in ROW:
            value = observation(False); del value['history']['rows'][0][key]; rehash(value)
            with self.subTest(absent=key), self.assertRaises(Denied): self.admit(value)

    def test_pending_conflicting_and_ambiguous_retry_groups_deny(self):
        changes = [
            lambda r: r[0].update(rolled_back_at=None),
            lambda r: r[0].update(checksum='b' * 64),
            lambda r: r[0].update(rolled_back_at=r[1]['started_at']),
            lambda r: r[0].update(rolled_back_at=r[1]['finished_at']),
            lambda r: r[0].update(rolled_back_at='2025-01-01T00:00:00.000000Z'),
            lambda r: r[0].update(finished_at=r[0]['rolled_back_at'], rolled_back_at=None),
            lambda r: r[1].update(id=r[0]['id']),
            lambda r: r[1].update(finished_at=None),
            lambda r: r.reverse(),
            lambda r: r.append({**r[-1], 'id': '00000000-0000-0000-0000-000000000003',
                                'started_at': '2026-01-01T00:00:04.000000Z', 'finished_at': None})]
        # Red if a denial is explained only by stale summaries rather than the
        # unresolved attempts themselves. Supply the independently expected failed
        # inventory so the core must reach its history admission gate.
        for index, change in enumerate(changes):
            value = observation(); change(value['history']['rows'])
            rows = value['history']['rows']
            value['history']['row_count'] = len(rows); rehash(value)
            value['applied_migrations'] = []
            value['failed_migrations'] = [{k: row[k] for k in
                ('name', 'checksum', 'finished_at', 'rolled_back_at')} for row in rows]
            reason = 'history-row' if index == 6 else 'history-order' if index == 8 else 'database-evidence'
            with self.subTest(change=change), self.assertRaisesRegex(Denied, '^' + reason + '$'):
                self.admit(value)

    def test_digest_summary_identity_visibility_and_snapshot_mutations_deny(self):
        cases = [
            ('version', True), ('version', 2), ('row_count', True), ('row_count', 1),
            ('system_identifier', 1111111111111111111), ('system_identifier', str(2**64)),
            ('database', 'other'), ('observer_role', 'other'), ('port', '5433'),
            ('relation', {'oid': True}), ('relation', {'name': 'filtered_view'}),
            ('relation', {'kind': 'v'}), ('relation', {'extra': True}),
            ('snapshot', {'id': '101:100:'}), ('snapshot', {'id': '100:102:102'}),
            ('snapshot', {'id': '100:102:101,101'}), ('snapshot', {'isolation': 'read committed'}),
            ('snapshot', {'read_only': False}), ('visibility', {'complete': False}),
            ('visibility', {'select': False}), ('visibility', {'rls_enabled': True}),
            ('visibility', {'rls_forced': True}), ('observed_at', '2026-01-01T00:00:00'),
            ('extra', True)]
        for key, change in cases:
            value = observation()
            if isinstance(change, dict): value['history'][key].update(change)
            else: value['history'][key] = change
            rehash(value)
            with self.subTest(key=key, change=change), self.assertRaises(Denied): self.admit(value)
        for mutate in (
            lambda v: v['history'].update(sha256='sha256:' + '0' * 64),
            lambda v: v['applied_migrations'][0].update(checksum='b' * 64),
            lambda v: v.update(failed_migrations=[v['history']['rows'][0]]),
            lambda v: v.update(system_identifier='2222'),
            lambda v: v.update(server_major=True),
            lambda v: v.update(observed_at=True)):
            value = observation(); mutate(value)
            with self.subTest(mutation=mutate), self.assertRaises(Denied): self.admit(value)
        value = observation()
        with self.assertRaisesRegex(Denied, 'history-binding'):
            evidence.database(value, INVENTORY, '2222')
        value['history']['observed_at'] = '2026-01-01T00:00:05.000000Z'; rehash(value)
        with self.assertRaisesRegex(Denied, 'stale-evidence'): self.admit(value)

    def test_resolved_retry_preserves_exact_inventory_and_sensitive_delta_denials(self):
        for inventory in ([], [{**INVENTORY[0], 'checksum': 'b' * 64}],
                          [*INVENTORY, {'name': '20261003000000_missing', 'checksum': 'b' * 64}]):
            with self.assertRaisesRegex(Denied, 'migration-required'):
                self.admit(observation(), inventory)
        base, head, delta = 'b' * 40, 'a' * 40, 'sha256:' + 'c' * 64
        for path in ('prisma/migrations/new/migration.sql', 'apps/intelligence-worker/src/main.ts'):
            value = {'production_revision': base, 'diff_base': base, 'diff_head': head,
                     'complete_delta': True, 'changed_paths': [path], 'delta_sha256': delta,
                     'compatibility': {'base': base, 'head': head, 'delta_sha256': delta,
                        'paths_sha256': digest([path]), 'evidence_sha256': delta,
                        'independent_review': True, 'all_shared_dependencies_reviewed': True, 'compatible': True}}
            self.admit(observation())
            with self.assertRaisesRegex(Denied, 'sensitive-files'):
                evidence.compatibility(value, base, head)


if __name__ == '__main__':
    unittest.main()
