"""Synthetic immutable Git trees/blobs only; never network, tokens or applications."""
import copy
import hashlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from contract import Denied, canonical, digest
from operator_github import GitHub, backend_release, REPO

BASE, HEAD = 'a' * 40, 'b' * 40
CHECK = 'check:source-live-certification-evidence'
FILES = {'Dockerfile': 'ec1487f1442ddd7a965f924bc3a3f889eb857239',
         'scripts/rewrite-build-aliases.mjs': '1155417025d95054290792f498b168051ff08d3e',
         'prisma.config.ts': '188ca3530882cbfaf2c6447ca9db04b1433e68c2',
         'tsconfig.build.json': '9ef33781c0953cd4485e380de32dec7e47dae5c8',
         'tsconfig.json': 'de2385308366a040932befc7bc30a37876609212'}


def package():
    return {'name': 'TEST-only', 'private': True, 'dependencies': {'test-fixture': '1.0.0'},
            'scripts': {'build': 'tsc -p tsconfig.build.json && node scripts/rewrite-build-aliases.mjs -p tsconfig.build.json',
                        'prisma:generate': 'prisma generate --schema prisma/schema.prisma',
                        CHECK: 'node TEST-old-check.mjs', 'check:other': 'node TEST-other.mjs'}}


def blob_sha(raw):
    return hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


class Fixture:
    def __init__(self, old=None, new=None, mutate=None):
        self.old = canonical(package()) if old is None else old
        changed = package(); changed['scripts'][CHECK] = 'node TEST-new-check.mjs'
        self.new = canonical(changed) if new is None else new
        self.raw = {blob_sha(raw): raw for raw in (self.old, self.new)}
        self.calls = []
        fixture = self
        class Runner:
            def run(self, argv, **kwargs):
                endpoint = argv[-1].split('/repos/' + REPO + '/', 1)[1]
                fixture.calls.append(endpoint)
                if endpoint.startswith('git/commits/'):
                    revision = endpoint.rsplit('/', 1)[1]
                    result = {'sha': revision, 'tree': {'sha': 'c' * 40 if revision == BASE else 'd' * 40}}
                elif endpoint.startswith('git/trees/'):
                    old = 'c' * 40 in endpoint
                    entries = [{'path': p, 'mode': '100644', 'type': 'blob', 'sha': s} for p, s in FILES.items()]
                    entries.append({'path': 'package.json', 'mode': '100644', 'type': 'blob',
                                    'sha': blob_sha(fixture.old if old else fixture.new)})
                    result = {'sha': 'c' * 40 if old else 'd' * 40, 'truncated': False, 'tree': entries}
                else:
                    assert endpoint.startswith('git/blobs/'), endpoint
                    sha = endpoint.rsplit('/', 1)[1]
                    assert 'Accept: application/vnd.github.raw+json' in argv
                    assert kwargs['limit'] == 128 * 1024
                    result = fixture.raw[sha]
                if mutate:
                    changed = mutate(endpoint, result)
                    if changed is not None: result = changed
                return result if type(result) is bytes else canonical(result)
        self.config = SimpleNamespace(recheck=lambda: None, github_binding=None)
        self.gh = GitHub(self.config, Runner())

    def proof(self):
        paths, delta = self.gh.delta(BASE, HEAD)
        return self.gh.package_scripts(BASE, HEAD, delta)


class PackageScriptTests(unittest.TestCase):
    def test_exact_blobs_and_build_contract_produce_bound_proof_without_reobserving_trees(self):
        fixture = Fixture(); proof = fixture.proof()
        self.assertEqual(proof['base'], BASE); self.assertEqual(proof['head'], HEAD)
        self.assertEqual(proof['before_blob'], blob_sha(fixture.old))
        self.assertEqual(proof['after_blob'], blob_sha(fixture.new))
        self.assertEqual(proof['changed_scripts'], [CHECK])
        self.assertEqual(proof['before_sha256'], 'sha256:' + hashlib.sha256(fixture.old).hexdigest())
        self.assertEqual(proof['after_sha256'], 'sha256:' + hashlib.sha256(fixture.new).hexdigest())
        self.assertEqual(len(fixture.calls), 6)  # Two commits, two trees, two immutable blobs.
        with self.assertRaises(Denied): fixture.gh.package_scripts(BASE, HEAD, 'sha256:' + '0' * 64)

    def test_large_valid_package_uses_bounded_raw_bytes_not_a_base64_json_string(self):
        old = package(); old['fixture_padding'] = ['x' * 40000, 'y' * 40000]
        new = copy.deepcopy(old); new['scripts'][CHECK] = 'node TEST-new-check.mjs'
        fixture = Fixture(canonical(old), canonical(new))
        self.assertGreater(len(fixture.old), 65536)
        self.assertLess(len(fixture.old), 128 * 1024)
        self.assertEqual(fixture.proof()['changed_scripts'], [CHECK])

    def test_only_the_fixed_check_value_may_change(self):
        changes = [lambda p: p.update(private=1), lambda p: p.update(name='changed'),
                   lambda p: p['dependencies'].update({'test-fixture': '2.0.0'}),
                   lambda p: p['scripts'].update(build='npm run ' + CHECK),
                   lambda p: p['scripts'].update({'check:other': 'changed'}),
                   lambda p: p['scripts'].update({'check:new': 'new'}),
                   lambda p: p['scripts'].pop(CHECK), lambda p: p.update(scripts=[])]
        for hook in ('preinstall', 'install', 'postinstall', 'prepublish', 'prepare', 'preprepare', 'postprepare',
                     'dependencies', 'prebuild', 'postbuild', 'preprisma:generate', 'postprisma:generate'):
            changes.append(lambda p, hook=hook: p['scripts'].update({hook: 'npm run ' + CHECK}))
        for change in changes:
            value = package(); value['scripts'][CHECK] = 'node TEST-new.mjs'; change(value)
            with self.subTest(change=changes.index(change)), self.assertRaises(Denied):
                Fixture(new=canonical(value)).proof()
        # An unchanged pre-existing indirect build hook is unsafe too.
        old = package(); old['scripts']['postbuild'] = 'npm run ' + CHECK
        new = copy.deepcopy(old); new['scripts'][CHECK] = 'changed'
        with self.assertRaises(Denied): Fixture(canonical(old), canonical(new)).proof()

    def test_malformed_duplicate_oversized_or_incomplete_content_is_never_proof(self):
        for raw in (b'{}', b'[]', b'not-json', b'\xff', b'{"scripts":{},"scripts":{}}',
                    canonical({'x': 'x' * (128 * 1024)}), canonical(package()).decode().encode('utf-16')):
            with self.subTest(size=len(raw)), self.assertRaises(Denied): Fixture(new=raw).proof()
        for raw in (b'', b'{}', b'JSON-wrapper-instead-of-raw', b'x' * (128 * 1024 + 1)):
            def modify(endpoint, value):
                if endpoint.startswith('git/blobs/'): return raw
            with self.subTest(blob_size=len(raw)), self.assertRaises(Denied): Fixture(mutate=modify).proof()
        for mode in ('100755', '120000', '160000'):
            def modify(endpoint, value):
                if endpoint.startswith('git/trees/'):
                    entry = next(e for e in value['tree'] if e['path'] == 'package.json'); entry['mode'] = mode
                    if mode == '160000': entry['type'] = 'commit'
            with self.subTest(mode=mode), self.assertRaises(Denied): Fixture(mutate=modify).proof()
        for missing in ('package.json', 'Dockerfile'):
            def modify(endpoint, value):
                if endpoint.startswith('git/trees/') and 'c' * 40 in endpoint:
                    value['tree'] = [e for e in value['tree'] if e['path'] != missing]
            with self.subTest(missing=missing), self.assertRaises(Denied): Fixture(mutate=modify).proof()
        def truncated(endpoint, value):
            if endpoint.startswith('git/trees/'): value['truncated'] = True
        with self.assertRaises(Denied): Fixture(mutate=truncated).proof()

    def test_build_closure_drift_and_default_install_hook_refuse(self):
        for path in FILES:
            def modify(endpoint, value):
                if endpoint.startswith('git/trees/'):
                    next(e for e in value['tree'] if e['path'] == path)['sha'] = 'e' * 40
            with self.subTest(path=path), self.assertRaises(Denied): Fixture(mutate=modify).proof()
        def binding_gyp(endpoint, value):
            if endpoint.startswith('git/trees/'):
                value['tree'].append({'path': 'binding.gyp', 'mode': '100644', 'type': 'blob', 'sha': 'e' * 40})
        with self.assertRaises(Denied): Fixture(mutate=binding_gyp).proof()

    def test_backend_adapter_binds_proof_once_for_equal_live_bases(self):
        fixture = Fixture(); binding = {'sha': HEAD, 'ci_run_id': '123', 'api_revision': BASE,
            'worker_revision': BASE, 'non_target_snapshot_sha256': 'sha256:' + 'f' * 64}
        with patch('operator_github.GitHub', return_value=fixture.gh), \
             patch.object(fixture.gh, 'main', return_value=HEAD), \
             patch.object(fixture.gh, 'legacy', return_value='disabled_manually'), \
             patch.object(fixture.gh, 'run', return_value={'run_attempt': 1}), \
             patch.object(fixture.gh, 'jobs', return_value=[{'conclusion': 'success'}]):
            observed = backend_release(fixture.config, None, binding)
        self.assertEqual(observed['deltas']['api'], observed['deltas']['jev-intelligence-worker'])
        self.assertEqual(len(fixture.calls), 6)
        self.assertEqual(observed['deltas']['api']['package_scripts']['head'], HEAD)


if __name__ == '__main__': unittest.main()
