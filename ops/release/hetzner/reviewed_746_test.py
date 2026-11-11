"""Exact reviewed tree evidence; no local Git history or real project data required."""
import copy
import unittest
from unittest.mock import patch
from contract import Denied, digest
from evidence import (REVIEW_746_BASE, REVIEW_746_HEAD, REVIEW_746_DIGEST, REVIEW_746_PATHS,
                      PACKAGE_BUILD, PACKAGE_CHECK, backend_compatibility)
from operator_github import GitHub, backend_release

HEAD = 'f' * 40
SNAPSHOT = 'sha256:' + 'c' * 64
ENTRIES = {
    'docs/iterations/2026-11-11-github-trending-runtime-smoke.md': (None, ('100644', 'blob', '0cdae3715e1b36979b5d1759f48eea06cd774504')),
    'docs/iterations/2026-11-11-source-live-provider-evidence-validation.md': (None, ('100644', 'blob', '046887447bac71ef6ff3cde5b391cbd4630fbec7')),
    'libs/ingestion/adapters/persistence/github-trending-source-identities.ts': (None, ('100644', 'blob', 'a1d63f81b7bb0dc8eacc2f2e99691176ddfe3389')),
    'libs/ingestion/adapters/persistence/in-memory-source-item.repository.ts': (('100644', 'blob', '0e81f1bc4a3a312c303e10f4dca804e6187f308b'), ('100644', 'blob', '8ebb9a748cbe18b464e75b3fda1bf35ac3567869')),
    'libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client.ts': (('100644', 'blob', 'a87d2f9ea39267a1d14374533ab13404dc97a607'), ('100644', 'blob', 'c138f1a2c7596732a2044ef250a1e82c6683d629')),
    'libs/ingestion/adapters/persistence/prisma/prisma-source-item-batch-writer.ts': (('100644', 'blob', '8e4aebc2897039c356eac0add10211cbffed9f31'), ('100644', 'blob', '18b6cd6fce959bc0b7f623cdeeb1d3fdd55fa336')),
    'libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository.spec.ts': (('100644', 'blob', '37122274c48bf962e0dbf3da1353ac33bb783197'), ('100644', 'blob', '43f5fb969a9521ac3a7f6f2b4e29c6e37e8edf9c')),
    'libs/ingestion/adapters/source/github-trending-page/github-trending-page-snapshot-integrity.spec.ts': (None, ('100644', 'blob', 'a43afec3e2047c5cb38e5e1bedd0ecb09391a260')),
    'libs/ingestion/domain/value-objects/github-trending-page.ts': (('100644', 'blob', 'cdd35e58ec65136ec751c6bd7c43f6b6e392eba1'), ('100644', 'blob', 'e0545a5701811d51ca2c7171c2bbfbe573ff124f')),
    'package.json': (('100644', 'blob', '51a2a5005706096cc2d3ebf85b1d862dc6f6d570'), ('100644', 'blob', '2ddcf7a9270a131ca9a868150a913aed03ebe2d2')),
    'scripts/check-source-line-cap.mjs': (('100644', 'blob', '5074a0b748f270fa9ad9d702d981c1d9ee1e34b0'), ('100644', 'blob', 'a79b8a4ad594cf23148430b3ebcbe79ac77b59c9')),
    'scripts/check-source-live-certification-evidence.mjs': (('100644', 'blob', 'fff16ed07dff89f02ed9dddf5feeb80678766a06'), ('100644', 'blob', '5e381da24eccef9e9a8717a615c67528ee3fdb10')),
    'scripts/check-source-provider-runtime-contract.ts': (('100644', 'blob', '138032b9ff7fcbd896eeced4c6649312c87452b4'), ('100644', 'blob', '550f95f6ae879a5b4ae873a7d2239aa9f0616430')),
    'scripts/ci/source-provider-github-trending-runtime-gate.test.mjs': (None, ('100644', 'blob', '74b703a5229c2b8fc973c4dd94c796fa968c52a2')),
    'scripts/lib/source-live-certification-evidence-shape.test.mjs': (('100644', 'blob', '189ecf0e86fa2583790de054705f5d6734580886'), ('100644', 'blob', '99b4c35b9a72b46a654fe70e6bb9d4e4281cbc5f')),
    'scripts/lib/source-live-provider-evidence-validation.mjs': (None, ('100644', 'blob', '997d1c76ea0b2a4d4d0d38fdcf220c7c77c02595')),
    'scripts/lib/source-live-provider-evidence-validation.test.mjs': (None, ('100644', 'blob', 'ba0790efc7245caee460b2166128fa4bacf19058')),
    'scripts/lib/source-provider-github-trending-runtime-smoke.ts': (None, ('100644', 'blob', '64c2258303cc719cd0e9d0bd11c869473fd27208')),
}


def entry(value):
    return dict(zip(('mode', 'type', 'sha'), value))


class Reviewed746Tests(unittest.TestCase):
    def setUp(self):
        self.old = {p: entry(pair[0]) for p, pair in ENTRIES.items() if pair[0] is not None}
        self.new = {p: entry(pair[1]) for p, pair in ENTRIES.items() if pair[1] is not None}
        self.next = copy.deepcopy(self.new)
        self.next['ops/release/fixture.py'] = entry(('100644', 'blob', 'e' * 40))

    def collect(self, old=None, current=None, package=None):
        trees = {REVIEW_746_BASE: self.old if old is None else old, REVIEW_746_HEAD: self.new,
                 HEAD: self.next if current is None else current}
        binding = {'sha': HEAD, 'ci_run_id': '123', 'api_revision': REVIEW_746_BASE,
                   'worker_revision': REVIEW_746_BASE, 'non_target_snapshot_sha256': SNAPSHOT}
        class Config:
            recheck = lambda self: None
        def package_proof(_self, base, head, checksum):
            value = {'base': base, 'head': head, 'delta_sha256': checksum,
                     'changed_scripts': [PACKAGE_CHECK], 'before_blob': '1' * 40, 'after_blob': '2' * 40,
                     'before_sha256': 'sha256:' + '3' * 64, 'after_sha256': 'sha256:' + '4' * 64,
                     'build_contract_sha256': digest(PACKAGE_BUILD)}
            if package is not None:
                value.update(package)
            return value
        with patch.object(GitHub, 'main', return_value=HEAD), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'tree', side_effect=lambda sha: trees[sha]), \
             patch.object(GitHub, 'package_scripts', package_proof):
            return backend_release(Config(), object(), binding)

    def test_exact_review_with_ci_only_continuation_and_package_proof(self):
        value = self.collect()
        delta = value['deltas']['api']
        self.assertEqual(delta['reviewed_746']['review_delta_sha256'], REVIEW_746_DIGEST)
        self.assertEqual(set(delta['changed_paths']), REVIEW_746_PATHS | {'ops/release/fixture.py'})
        self.assertEqual(delta['package_scripts']['delta_sha256'], delta['delta_sha256'])
        self.assertEqual(delta, value['deltas']['jev-intelligence-worker'])

    def test_identical_tree_at_new_head_is_allowed(self):
        self.assertEqual(self.collect(current=copy.deepcopy(self.new))['deltas']['api']['reviewed_746']['continuation'], [])

    def test_any_reviewed_blob_change_on_either_side_is_rejected(self):
        for path in REVIEW_746_PATHS:
            before = copy.deepcopy(self.old)
            if path in before: before[path]['sha'] = '7' * 40
            else: before[path] = entry(('100644', 'blob', '7' * 40))
            with self.subTest(path=path, side='before'), self.assertRaises(Denied): self.collect(old=before)
            after = copy.deepcopy(self.next)
            after[path]['sha'] = '8' * 40
            with self.subTest(path=path, side='after'), self.assertRaises(Denied): self.collect(current=after)

    def test_extra_runtime_or_package_build_change_is_rejected(self):
        after = copy.deepcopy(self.next)
        after['libs/ingestion/unreviewed.ts'] = entry(('100644', 'blob', '8' * 40))
        with self.assertRaises(Denied): self.collect(current=after)
        with self.assertRaises(Denied): self.collect(package={'changed_scripts': ['build']})

    def test_tamper_or_other_base_is_rejected(self):
        value = self.collect(); revisions = {s: REVIEW_746_BASE for s in value['deltas']}
        for key, invalid in [('head', REVIEW_746_HEAD), ('delta_sha256', SNAPSHOT),
                             ('review_delta_sha256', SNAPSHOT), ('continuation', ['libs/other.ts'])]:
            candidate = copy.deepcopy(value); candidate['deltas']['api']['reviewed_746'][key] = invalid
            with self.subTest(key=key), self.assertRaises(Denied):
                backend_compatibility(candidate, revisions, HEAD, SNAPSHOT)
        candidate = copy.deepcopy(value); candidate['deltas']['api'].pop('reviewed_746')
        with self.assertRaises(Denied): backend_compatibility(candidate, revisions, HEAD, SNAPSHOT)
        candidate = copy.deepcopy(value); candidate['api_revision'] = 'a' * 40
        candidate['deltas']['api']['base'] = 'a' * 40; revisions['api'] = 'a' * 40
        with self.assertRaises(Denied): backend_compatibility(candidate, revisions, HEAD, SNAPSHOT)

if __name__ == '__main__': unittest.main()
