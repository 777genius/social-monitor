import copy
import hashlib
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from contract import Denied, canonical, digest
from evidence import (PACKAGE_BUILD, REVIEW_764_BASE, REVIEW_764_HEAD, REVIEW_764_DIGEST,
                      REVIEW_764_PATHS, REVIEW_764_DOCKERFILE, backend_compatibility,
                      package_build_contract)
from operator_github import GitHub, backend_release

SNAPSHOT = 'sha256:' + 'c' * 64
CONTINUED = 'f' * 40


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


class Reviewed764Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.delta = json.loads((Path(__file__).parent / 'fixtures/review_764_delta.json').read_text())
        cls.old = {row['path']: row['before'] for row in cls.delta if row['before'] is not None}
        cls.new = {row['path']: row['after'] for row in cls.delta if row['after'] is not None}
        for tree in (cls.old, cls.new):
            for path, sha in PACKAGE_BUILD['files'].items():
                if path != 'Dockerfile':
                    tree[path] = {'mode': '100644', 'type': 'blob', 'sha': sha}

    def collect(self, mutate=None, package=False, unsafe_package=False):
        old, reviewed = copy.deepcopy(self.old), copy.deepcopy(self.new)
        current = copy.deepcopy(reviewed)
        current['ops/release/TEST-proof.py'] = {'mode': '100644', 'type': 'blob', 'sha': 'd' * 40}
        documents = {}
        if package:
            before = {'name': 'TEST', 'scripts': {**PACKAGE_BUILD['scripts'], 'check:test': 'old'}}
            after = copy.deepcopy(before); after['scripts']['check:test'] = 'new'
            if unsafe_package:
                after['scripts']['run:unreviewed'] = 'node changed.js'
            for tree, doc in ((old, before), (reviewed, before), (current, after)):
                raw = canonical(doc); documents[blob(raw)] = raw
                tree['package.json'] = {'mode': '100644', 'type': 'blob', 'sha': blob(raw)}
        if mutate:
            mutate(old, reviewed, current)
        trees = {REVIEW_764_BASE: old, REVIEW_764_HEAD: reviewed, CONTINUED: current}
        binding = {'sha': CONTINUED, 'ci_run_id': '123', 'api_revision': REVIEW_764_BASE,
                   'worker_revision': REVIEW_764_BASE, 'non_target_snapshot_sha256': SNAPSHOT}
        class Config:
            recheck = lambda self: None
        with patch.object(GitHub, 'main', return_value=CONTINUED), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'tree', side_effect=lambda sha: trees[sha]), \
             patch.object(GitHub, '_read', side_effect=lambda path, _accept, _limit: documents[path.removeprefix('git/blobs/')]):
            return backend_release(Config(), object(), binding)

    def test_exact_reviewed_git_delta(self):
        self.assertEqual(digest(self.delta), REVIEW_764_DIGEST)
        self.assertEqual({row['path'] for row in self.delta}, REVIEW_764_PATHS)
        self.assertEqual(self.new['Dockerfile']['sha'], REVIEW_764_DOCKERFILE)

    def test_exact_delta_and_ci_only_continuation_are_admitted(self):
        result = self.collect()
        proof = result['deltas']['api']['reviewed_764']
        self.assertEqual(proof['review_delta_sha256'], REVIEW_764_DIGEST)
        self.assertEqual(proof['continuation'], ['ops/release/TEST-proof.py'])

    def test_tampered_review_or_runtime_continuation_is_rejected(self):
        for mutation in (
            lambda old, reviewed, current: reviewed['Dockerfile'].update(sha='e' * 40),
            lambda old, reviewed, current: current['Dockerfile'].update(sha='e' * 40),
            lambda old, reviewed, current: current.update({'apps/x-collector/TEST.py': {'mode':'100644','type':'blob','sha':'e'*40}}),
        ):
            with self.subTest(mutation=mutation), self.assertRaises(Denied):
                self.collect(mutation)

    def test_forged_review_proof_is_rejected(self):
        result = self.collect()
        revisions = {service: REVIEW_764_BASE for service in result['deltas']}
        for mutation in (
            lambda delta: delta['reviewed_764'].update(review_delta_sha256=SNAPSHOT),
            lambda delta: delta['reviewed_764'].update(continuation=['Dockerfile']),
            lambda delta: delta.pop('reviewed_764'),
        ):
            candidate = copy.deepcopy(result); mutation(candidate['deltas']['api'])
            with self.subTest(mutation=mutation), self.assertRaises(Denied):
                backend_compatibility(candidate, revisions, CONTINUED, SNAPSHOT)

    def test_check_script_continuation_binds_both_dockerfiles(self):
        result = self.collect(package=True)
        proof = result['deltas']['api']['package_scripts']
        self.assertEqual(proof['changed_scripts'], ['check:test'])
        self.assertEqual(proof['build_contract_sha256'], digest(package_build_contract(reviewed_764=True)))
        forged = copy.deepcopy(result)
        forged['deltas']['api']['package_scripts']['build_contract_sha256'] = digest(PACKAGE_BUILD)
        revisions = {service: REVIEW_764_BASE for service in result['deltas']}
        with self.assertRaises(Denied):
            backend_compatibility(forged, revisions, CONTINUED, SNAPSHOT)

    def test_future_check_script_change_keeps_reviewed_dockerfile_pinned(self):
        old_doc = {'name': 'TEST', 'scripts': {**PACKAGE_BUILD['scripts'], 'check:test': 'old'}}
        new_doc = copy.deepcopy(old_doc); new_doc['scripts']['check:test'] = 'new'
        raw = [canonical(old_doc), canonical(new_doc)]
        entries = {path: {'mode':'100644','type':'blob','sha':sha} for path, sha in PACKAGE_BUILD['files'].items()}
        entries['Dockerfile']['sha'] = REVIEW_764_DOCKERFILE
        trees = {rev: {**copy.deepcopy(entries), 'package.json': {'mode':'100644','type':'blob','sha':blob(doc)}}
                 for rev, doc in zip(('a'*40, 'b'*40), raw)}
        payloads = {blob(doc):doc for doc in raw}
        gh = GitHub(object(), object())
        with patch.object(gh, 'tree', side_effect=lambda rev: trees[rev]), \
             patch.object(gh, '_read', side_effect=lambda path, _accept, _limit: payloads[path.removeprefix('git/blobs/')]):
            _, change = gh.delta('a'*40, 'b'*40)
            proof = gh.package_scripts('a'*40, 'b'*40, change)
            self.assertEqual(proof['build_contract_sha256'], digest(package_build_contract(stable_764=True)))
            trees['b'*40]['Dockerfile']['sha'] = 'e'*40
            _, altered = gh.delta('a'*40, 'b'*40)
            with self.assertRaises(Denied):
                gh.package_scripts('a'*40, 'b'*40, altered)

    def test_noncheck_script_continuation_is_refused(self):
        with self.assertRaises(Denied):
            self.collect(package=True, unsafe_package=True)


if __name__ == '__main__':
    unittest.main()
