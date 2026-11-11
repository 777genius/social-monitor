import copy
import hashlib
import json
import unittest
from unittest.mock import patch
from contract import Denied, digest
from evidence import (REVIEW_BASE, REVIEW_HEAD, REVIEW_DIGEST, REVIEW_PATHS,
                      PACKAGE_BUILD, PACKAGE_CHECK, backend_compatibility)
from operator_github import GitHub, backend_release

SNAPSHOT = 'sha256:' + 'c' * 64
HEAD = 'f' * 40
# Immutable entries for the independently reviewed delta; no repository history is required.
REVIEW_ENTRIES = {
    'apps/x-collector/src/x_collector/grpc_service.py': (('100644', 'blob', '1067d955d5ff9c86e68ec489a7d15d37d0d78004'), ('100644', 'blob', 'c67695f10f3f0b339cbb9dd05651edbcdd92a0f4')),
    'apps/x-collector/src/x_collector/rpc_drain.py': (None, ('100644', 'blob', 'e9e0558d8e6acce18584560dfcaf7210d354c050')),
    'apps/x-collector/src/x_collector/server.py': (('100644', 'blob', '997d8f22d0945e90c930d76501245821921e48ed'), ('100644', 'blob', '33285094134fc2b2ab3f8d1578df9403e82cc300')),
    'apps/x-collector/tests/test_grpc_failure_diagnostic.py': (('100644', 'blob', '28f587a0954a8eb87d4efacf9b7e702fa5a5acd8'), ('100644', 'blob', '5946678a338822a689dc04bb864001fa028d00be')),
    'apps/x-collector/tests/test_health_monitor.py': (('100644', 'blob', '092f7340b6fd1055b85be9f7c6a7c8b26b1f8fb8'), ('100644', 'blob', '9cceb13c42ec1abd1dccc6beca7cf19d01c295d8')),
    'apps/x-collector/tests/test_rpc_drain_grpc.py': (None, ('100644', 'blob', '7973225b58be2cfb187d1830aea8dc38d69bde9f')),
    'apps/x-collector/tests/test_rpc_drain_shutdown.py': (None, ('100644', 'blob', '3a91c69a03db27708805b2b707ab625d94a465e2')),
    'apps/x-collector/tests/test_rpc_drain_synthetic.py': (None, ('100644', 'blob', 'd89596305f39674e8eaf4d591e9d3bb38a17987f')),
    'libs/ingestion/adapters/source/hacker-news/hacker-news-client.port.ts': (('100644', 'blob', '23846c21277a86db1df27b8beaed25c8a6942b05'), ('100644', 'blob', '498e0a80a304518e99679fda223ef0fa53193a1c')),
    'libs/ingestion/adapters/source/hacker-news/hacker-news-multi-pass-collector.ts': (('100644', 'blob', '80967e56d6345059b2e96353887e0a9cd347c4a5'), ('100644', 'blob', '8b7b809f9551b9caab8ae5444ad97f5b111886dd')),
    'libs/ingestion/adapters/source/hacker-news/hacker-news-open-window-completeness.spec.ts': (None, ('100644', 'blob', '4e2a9d235f009cdbd102e56524f64eca29fc7662')),
    'libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider.spec.ts': (('100644', 'blob', '552e3ba14e8d1d4041191ce966a71bb17521af6d'), ('100644', 'blob', '413de96e907fc94501a9cf438b3ffca1b39a3d8d')),
    'libs/ingestion/adapters/source/hacker-news/http-hacker-news-client.ts': (('100644', 'blob', '68f5a88dbc96ade8a7d664fe1b1b7bf3db9e573d'), ('100644', 'blob', 'e8a3d830dd9eb53a43e728cda8af037cfea8856c')),
    'libs/ingestion/adapters/source/reddit/reddit-historical-partial-scan.spec.ts': (('100644', 'blob', '055d487919975a3a9efcbcd048a1eabfecd51d82'), ('100644', 'blob', 'd7ece3638154b79ffa655facd1644842977c2e42')),
    'libs/ingestion/adapters/source/reddit/reddit-multi-pass-collector.ts': (('100644', 'blob', 'b2bb4a0d917cdd5295e348141ecb162300ec5bdb'), ('100644', 'blob', '19202164c1015fc50a92e206b41bc10e9f5aac99')),
    'scripts/lib/clean-real-day-provider-acquisition.ts': (('100644', 'blob', 'b92a656a2cb49e2e993d668aeef2664fb133d19f'), ('100644', 'blob', '4a5a9e6fde319c49b6102dae58c2d36ed60f11cb')),
    'scripts/lib/clean-real-day-source-config-reader.spec.ts': (None, ('100644', 'blob', '61a942f806073f6ab1c299c2643e1b22306c2848')),
    'scripts/lib/clean-real-day-source-config-reader.ts': (('100644', 'blob', 'f868a17d8689483370f74f1a869dea435bca9cf7'), ('100644', 'blob', 'fc27e00f69d55bbaad0b22c55c5b388550808ac7')),
}


def blob(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def entry(value):
    return dict(zip(('mode', 'type', 'sha'), value))

class TestReviewedDelta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old = {path: entry(pair[0]) for path, pair in REVIEW_ENTRIES.items() if pair[0] is not None}
        cls.new = {path: entry(pair[1]) for path, pair in REVIEW_ENTRIES.items() if pair[1] is not None}
        package = {'scripts': {**PACKAGE_BUILD['scripts'], PACKAGE_CHECK: 'node synthetic.mjs'}}
        cls.package_bytes = json.dumps(package, separators=(',', ':')).encode()
        for values in (cls.old, cls.new):
            values['package.json'] = entry(('100644', 'blob', blob(cls.package_bytes)))
            for path, sha in PACKAGE_BUILD['files'].items():
                values[path] = entry(('100644', 'blob', sha))
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

    def test_tree_identical_different_commit_allows_empty_continuation_only(self):
        value = self.collect(copy.deepcopy(self.new))
        self.assertEqual(value['deltas']['api']['reviewed_231421']['continuation'], [])
        gh = GitHub(None, None)
        with patch.object(GitHub, 'tree', return_value=self.new):
            with self.assertRaises(Denied): gh.delta(REVIEW_HEAD, HEAD)
            self.assertEqual(gh.delta(REVIEW_HEAD, HEAD, allow_empty=True), ([], digest([])))

    def test_package_ci_continuation_keeps_existing_package_proof(self):
        raw_before = self.package_bytes
        package = json.loads(raw_before)
        package['scripts'][PACKAGE_CHECK] += ' && node synthetic-test.mjs'
        raw_after = json.dumps(package, separators=(',', ':')).encode()
        candidate = copy.deepcopy(self.continued)
        candidate['package.json']['sha'] = blob(raw_after)
        blobs = {blob(raw_before): raw_before, blob(raw_after): raw_after}
        value = self.collect(candidate, blobs=blobs)
        self.assertEqual(value['deltas']['api']['package_scripts']['changed_scripts'], [PACKAGE_CHECK])
        value['deltas']['api']['package_scripts']['changed_scripts'] = ['build']
        with self.assertRaises(Denied):
            backend_compatibility(value, {s: REVIEW_BASE for s in value['deltas']}, HEAD, SNAPSHOT)
        package['scripts']['build'] += ' && node bad.mjs'
        bad = json.dumps(package, separators=(',', ':')).encode()
        candidate['package.json']['sha'] = blob(bad)
        blobs[blob(bad)] = bad
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
