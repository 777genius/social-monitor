import copy
import hashlib
import json
import subprocess
import unittest
from unittest.mock import patch
from contract import Denied, digest
from evidence import (REVIEW_BASE, REVIEW_HEAD, REVIEW_DIGEST, REVIEW_PATHS,
                      PACKAGE_BUILD, PACKAGE_CHECK, backend_compatibility)
from operator_github import GitHub, backend_release

SNAPSHOT = 'sha256:' + 'c' * 64
HEAD = 'f' * 40
repo = '/Users/belief/TEST-sm-release-prompt-20261110'

def tree(sha):
    rows = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', sha], cwd=repo).split(b'\0')
    result = {}
    for row in filter(None, rows):
        meta, name = row.split(b'\t', 1)
        mode, kind, blob = meta.decode().split()
        result[name.decode()] = {'mode': mode, 'type': kind, 'sha': blob}
    return result

class TestReviewedDelta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old, cls.new = tree(REVIEW_BASE), tree(REVIEW_HEAD)
        cls.continued = copy.deepcopy(cls.new)
        cls.continued['docs/review-proof.md'] = {'mode': '100644', 'type': 'blob', 'sha': 'e' * 40}

    def collect(self, continued=None, old=None, blobs=None):
        trees = {REVIEW_BASE: old or self.old, REVIEW_HEAD: self.new, HEAD: continued or self.continued}
        binding = {'sha': HEAD, 'ci_run_id': '123', 'api_revision': REVIEW_BASE,
                   'worker_revision': REVIEW_BASE, 'non_target_snapshot_sha256': SNAPSHOT}
        class Config:
            recheck = lambda self: None
        def read(_self, path, _accept, _limit):
            return (blobs or {})[path.removeprefix('git/blobs/')]
        with patch.object(GitHub, 'main', return_value=HEAD), \
             patch.object(GitHub, 'legacy', return_value='disabled_manually'), \
             patch.object(GitHub, 'run', return_value={'run_attempt': 1}), \
             patch.object(GitHub, 'jobs', return_value=[{'conclusion': 'success'}]), \
             patch.object(GitHub, 'tree', side_effect=lambda sha: trees[sha]), \
             patch.object(GitHub, '_read', read):
            return backend_release(Config(), object(), binding)

    def test_exact_trees_and_allowed_docs(self):
        value = self.collect()
        proof = value['deltas']['api']['reviewed_231421']
        self.assertEqual(proof['review_delta_sha256'], REVIEW_DIGEST)
        self.assertEqual(proof['continuation'], ['docs/review-proof.md'])
        self.assertEqual(set(value['deltas']['api']['changed_paths']), REVIEW_PATHS | {'docs/review-proof.md'})
        self.assertEqual(value['deltas']['api'], value['deltas']['jev-intelligence-worker'])

    def test_package_ci_continuation_keeps_existing_package_proof(self):
        raw_before = subprocess.check_output(['git', 'show', REVIEW_BASE + ':package.json'], cwd=repo)
        package = json.loads(raw_before)
        package['scripts'][PACKAGE_CHECK] += ' && node synthetic-test.mjs'
        raw_after = json.dumps(package, separators=(',', ':')).encode()
        git_blob = lambda raw: hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
        candidate = copy.deepcopy(self.continued)
        candidate['package.json']['sha'] = git_blob(raw_after)
        blobs = {git_blob(raw_before): raw_before, git_blob(raw_after): raw_after}
        value = self.collect(candidate, blobs=blobs)
        self.assertEqual(value['deltas']['api']['package_scripts']['changed_scripts'], [PACKAGE_CHECK])
        value['deltas']['api']['package_scripts']['changed_scripts'] = ['build']
        with self.assertRaises(Denied):
            backend_compatibility(value, {s: REVIEW_BASE for s in value['deltas']}, HEAD, SNAPSHOT)
        package['scripts']['build'] += ' && node bad.mjs'
        bad = json.dumps(package, separators=(',', ':')).encode()
        candidate['package.json']['sha'] = git_blob(bad)
        blobs[git_blob(bad)] = bad
        with self.assertRaises(Denied): self.collect(candidate, blobs=blobs)

    def test_every_reviewed_blob_on_either_side_is_bound(self):
        for path in REVIEW_PATHS:
            before = copy.deepcopy(self.old)
            if path in before:
                before[path]['sha'] = '7' * 40
            else:
                before[path] = {'mode': '100644', 'type': 'blob', 'sha': '7' * 40}
            with self.subTest(path=path, side='before'), self.assertRaises(Denied): self.collect(old=before)
            after = copy.deepcopy(self.continued)
            after[path]['sha'] = '8' * 40
            with self.subTest(path=path, side='after'), self.assertRaises(Denied): self.collect(after)

    def test_other_runtime_and_modified_reviewed_blob_rejected(self):
        for path in ('libs/ingestion/adapters/source/reddit/reddit-multi-pass-collector.ts', 'apps/api-gateway/src/main.ts', 'package-lock.json'):
            candidate = copy.deepcopy(self.continued)
            candidate[path] = {'mode': '100644', 'type': 'blob', 'sha': '8' * 40}
            with self.subTest(path=path), self.assertRaises(Denied): self.collect(candidate)

    def test_proof_tamper_and_missing_proof_rejected(self):
        value = self.collect()
        revisions = {s: REVIEW_BASE for s in value['deltas']}
        for key, val in [('head', REVIEW_HEAD), ('delta_sha256', SNAPSHOT),
                         ('review_delta_sha256', SNAPSHOT), ('continuation', ['libs/other.ts'])]:
            candidate = copy.deepcopy(value)
            candidate['deltas']['api']['reviewed_231421'][key] = val
            with self.subTest(key=key), self.assertRaises(Denied):
                backend_compatibility(candidate, revisions, HEAD, SNAPSHOT)
        candidate = copy.deepcopy(value); candidate['deltas']['api'].pop('reviewed_231421')
        with self.assertRaises(Denied): backend_compatibility(candidate, revisions, HEAD, SNAPSHOT)

if __name__ == '__main__': unittest.main()
