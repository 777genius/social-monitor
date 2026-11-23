import copy
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from contract import Denied, canonical, digest
from evidence import (PACKAGE_BUILD, backend_compatibility, REVIEW_767_BASE, REVIEW_767_HEAD,
                      REVIEW_767_DIGEST, REVIEW_767_PATHS)
from operator_github import GitHub, backend_release

SNAPSHOT = 'sha256:' + 'c' * 64
CONTINUED = 'f' * 40


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


class Reviewed767Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.delta = json.loads((Path(__file__).parent / 'fixtures/review_767_delta.json').read_text())
        cls.old = {row['path']: row['before'] for row in cls.delta if row['before'] is not None}
        cls.new = {row['path']: row['after'] for row in cls.delta if row['after'] is not None}
        for tree in (cls.old, cls.new):
            for path, sha in PACKAGE_BUILD['files'].items():
                if path != 'Dockerfile':
                    tree[path] = {'mode': '100644', 'type': 'blob', 'sha': sha}
        old_doc = {'name': 'TEST', 'scripts': {**PACKAGE_BUILD['scripts'], 'check:test': 'old'}}
        new_doc = copy.deepcopy(old_doc)
        new_doc['scripts']['check:test'] = 'new'
        cls.raw = [canonical(old_doc), canonical(new_doc)]
        for tree, raw in zip((cls.old, cls.new), cls.raw):
            tree['package.json'] = {'mode': '100644', 'type': 'blob', 'sha': blob(raw)}
        cls.synthetic_digest = cls.delta_digest(cls.old, cls.new)

    @staticmethod
    def delta_digest(old, new):
        paths = sorted(p for p in old.keys() | new.keys() if old.get(p) != new.get(p))
        return digest([{'path': p, 'before': old.get(p), 'after': new.get(p)} for p in paths])

    def collect(self, mutate=None):
        old, reviewed = copy.deepcopy(self.old), copy.deepcopy(self.new)
        current = copy.deepcopy(reviewed)
        current['ops/release/TEST-proof.py'] = {'mode': '100644', 'type': 'blob', 'sha': 'd' * 40}
        if mutate:
            mutate(old, reviewed, current)
        trees = {REVIEW_767_BASE: old, REVIEW_767_HEAD: reviewed, CONTINUED: current}
        binding = {'sha': CONTINUED, 'ci_run_id': '123', 'api_revision': REVIEW_767_BASE,
                   'worker_revision': REVIEW_767_BASE, 'non_target_snapshot_sha256': SNAPSHOT}
        payloads = {blob(raw): raw for raw in self.raw}
        class Config:
            recheck = lambda self: None
        def read(_self, path, _accept, _limit):
            return payloads[path.removeprefix('git/blobs/')]
        with patch('evidence.REVIEW_767_DIGEST', self.synthetic_digest), \
             patch.object(GitHub, 'main', return_value=CONTINUED), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'tree', side_effect=lambda sha: trees[sha]), \
             patch.object(GitHub, '_read', read):
            return backend_release(Config(), object(), binding)

    def test_exact_production_tree_digest_and_paths(self):
        self.assertEqual(digest(self.delta), REVIEW_767_DIGEST)
        self.assertEqual({entry['path'] for entry in self.delta}, REVIEW_767_PATHS)

    def test_reviewed_pair_and_ci_only_continuation(self):
        value = self.collect()
        self.assertEqual(value['deltas']['api']['reviewed_767']['review_delta_sha256'], self.synthetic_digest)
        self.assertEqual(value['deltas']['api']['reviewed_767']['continuation'], ['ops/release/TEST-proof.py'])

    def test_verifier_rejects_tampered_review_and_package_proofs(self):
        value = self.collect()
        revisions = {service: REVIEW_767_BASE for service in value['deltas']}
        mutations = [
            lambda d: d['reviewed_767'].update(review_delta_sha256=SNAPSHOT),
            lambda d: d['reviewed_767'].update(continuation=['scripts/check-source-line-cap.mjs']),
            lambda d: d['package_scripts'].update(build_contract_sha256=digest(PACKAGE_BUILD)),
            lambda d: d['package_scripts'].update(changed_scripts=['build']),
            lambda d: d.pop('reviewed_767'),
        ]
        for mutation in mutations:
            candidate = copy.deepcopy(value)
            mutation(candidate['deltas']['api'])
            with self.subTest(mutation=mutation), patch('evidence.REVIEW_767_DIGEST', self.synthetic_digest), self.assertRaises(Denied):
                backend_compatibility(candidate, revisions, CONTINUED, SNAPSHOT)

    def test_unreviewed_dockerfile_or_runtime_continuation_refused(self):
        mutations = [
            lambda old, reviewed, current: current['Dockerfile'].update(sha='e' * 40),
            lambda old, reviewed, current: current['apps/x-collector/src/x_collector/scweet_adapter.py'].update(sha='e' * 40),
            lambda old, reviewed, current: old['Dockerfile'].update(sha='e' * 40),
            lambda old, reviewed, current: current.update({'apps/api/TEST-runtime.ts': {'mode': '100644', 'type': 'blob', 'sha': 'a' * 40}}),
            lambda old, reviewed, current: current['scripts/rewrite-build-aliases.mjs'].update(sha='e' * 40),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(Denied):
                self.collect(mutation)

    def test_ci_only_reviewed_path_may_change_again(self):
        value = self.collect(lambda old, reviewed, current: current['scripts/check-source-line-cap.mjs'].update(sha='e' * 40))
        self.assertIn('scripts/check-source-line-cap.mjs', value['deltas']['api']['reviewed_767']['continuation'])

    def test_frontend_sources_continue_but_typescript_under_frontend_is_backend(self):
        dart = {'mode': '100644', 'type': 'blob', 'sha': 'a' * 40}
        value = self.collect(lambda old, reviewed, current: current.update({'apps/frontend/app/lib/main.dart': dart}))
        self.assertIn('apps/frontend/app/lib/main.dart', value['deltas']['api']['reviewed_767']['continuation'])
        with self.assertRaises(Denied):
            self.collect(lambda old, reviewed, current: current.update({'apps/frontend/tool/gen.ts': dart}))

if __name__ == '__main__':
    unittest.main()
