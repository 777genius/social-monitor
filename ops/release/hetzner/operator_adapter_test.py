"""Synthetic subprocess contracts only; never Docker/PG/GitHub qualification."""
import copy
import json
import os
from pathlib import Path
import sys
import shutil
import sysconfig
import tempfile
import subprocess
import time
import unittest
from unittest.mock import patch
from contract import Denied, canonical, digest, private_file_digest
from operator_adapter import Runner, dispatch, request
from operator_config import Configuration, SYSTEM_ID, decode, private_bytes, sha_bytes
import operator_github as github
import operator_probe as probe

BINDING = {'sha': 'a' * 40, 'ci_run_id': '123', 'archive_sha256': 'sha256:' + 'b' * 64,
           'image_id': 'sha256:' + 'c' * 64}
BASE = 'd' * 40
CONTAINER = 'e' * 64


class FixtureConfig(Configuration):
    def __init__(self):
        core = {'project': 'platform-social-monitor', 'project_directory': '/srv/platform/projects/social-monitor',
                'backup_max_age_seconds': 21600, 'evidence_max_age_seconds': 60,
                'backup_identity': {'wrapper': '/usr/local/sbin/pgbackrest-with-cipher-pass',
                    'config_path': '/etc/pgbackrest/production-main.conf', 'stanza': 'production-main',
                    'repository': '1', 'repository_id': 'repo-sha256-' + 'f' * 64, 'system_identifier': SYSTEM_ID}}
        data = {'version': 1, 'database': {'service': 'observer', 'database': 'fixture_db',
                'role': 'fixture_observer', 'host': '/var/run/postgresql', 'port': '5432'},
                'backup_config_sha256': 'sha256:' + '1' * 64, 'wrapper_sha256': 'sha256:' + '2' * 64}
        super().__init__(core, data)

    def recheck(self):
        self.recheck_inputs()


class FixtureRunner(Runner):
    """Command seam: each supplied response traverses real bounded subprocess pipes."""
    def __init__(self, provider):
        super().__init__()
        self.provider, self.calls = provider, []

    def run(self, argv, data=None, env=None, limit=2 * 1024**2):
        self.calls.append((argv, data, env))
        raw = self.provider(argv, data, env)
        if not isinstance(raw, bytes):
            raw = canonical(raw)
        fixture = Runner(seconds=3, command_seconds=2, checker=lambda p: Path(p).resolve())
        return fixture.run([sys.executable, '-I', '-c',
                            'import sys; sys.stdout.buffer.write(bytes.fromhex(' + repr(raw.hex()) + '))'], limit=limit)


def temporary():
    return tempfile.TemporaryDirectory(prefix='.operator-unit-', dir=Path(__file__).resolve().parents[3] / 'node_modules')


class WireAndBoundsTests(unittest.TestCase):
    def test_exact_request_grammar_all_verbs(self):
        from operator_adapter import REQUESTS
        for verb in REQUESTS:
            value = {} if verb in ('preflight', 'postgres-identity') else dict(BINDING)
            if verb == 'release-evidence':
                value['production_revision'] = BASE
            if verb == 'probe':
                value = {'sha': BINDING['sha'], 'image_id': BINDING['image_id'], 'container_id': CONTAINER}
            self.assertEqual(request(verb, canonical(value)), value)
            with self.assertRaises(Denied):
                request(verb, canonical({**value, 'approve': True}))
        for raw in (b'{"sha":1,"sha":2}', b'NaN', b'[]', b'{}garbage'):
            with self.assertRaises(Denied):
                request('backup', raw)
        for key, wrong in (('ci_run_id', '0123'), ('sha', '../candidate'), ('image_id', True)):
            with self.assertRaises(Denied):
                request('backup', canonical({**BINDING, key: wrong}))

    def test_real_process_environment_size_status_and_deadline(self):
        runner = Runner(seconds=4, command_seconds=1, checker=lambda p: Path(p).resolve())
        with patch.dict(os.environ, {'PGPASSWORD': 'fixture-only', 'GH_TOKEN': 'fixture-only'}):
            raw = runner.run([sys.executable, '-I', '-c',
                'import json,os; print(json.dumps(dict(os.environ)))'])
        self.assertNotIn('GH_TOKEN', json.loads(raw))
        self.assertNotIn('PGPASSWORD', json.loads(raw))
        for code, limit in (("print('x'*4096)", 128), ('import sys; sys.exit(9)', 128),
                            ('import time; time.sleep(3)', 128),
                            ("import sys; sys.stderr.write('x'*70000)", 128),
                            ("import sys; sys.stderr.write('unexpected warning')", 128)):
            start = time.monotonic()
            with self.assertRaises(Denied):
                Runner(seconds=2, command_seconds=.15, checker=lambda p: Path(p).resolve()).run(
                    [sys.executable, '-I', '-c', code], limit=limit)
            self.assertLess(time.monotonic() - start, 2)

    def test_private_file_races_and_symlinks_use_real_metadata(self):
        with temporary() as directory:
            path = Path(directory) / 'private'
            path.write_bytes(b'fixture-only')
            path.chmod(0o600)
            self.assertEqual(private_bytes(str(path), secret=True), b'fixture-only')
            config = FixtureConfig()
            # Separate the pinned mtime from immediate rewrites even on a
            # coarse filesystem; restored bytes must still fail the real fence.
            os.utime(path, ns=(1_000_000_000, 1_000_000_000))
            config.pin(str(path))
            path.write_bytes(b'replaced')
            with self.assertRaises(Denied):
                config.recheck()
            path.write_bytes(b'fixture-only')
            self.assertEqual(private_file_digest(str(path)), config.inputs[str(path)])
            with self.assertRaises(Denied):
                config.recheck()  # Content restored after a transient replacement still denies.
            alias = Path(directory) / 'alias'
            alias.symlink_to(path)
            with self.assertRaises(Denied):
                private_bytes(str(alias))
            path.chmod(0o644)
            with self.assertRaises(Denied):
                private_bytes(str(path), secret=True)

    def test_worktree_cli_cannot_become_installed_authority(self):
        result = subprocess.run([sys.executable, '-I', '-B',
            str(Path(__file__).with_name('operator_adapter.py')), 'preflight'],
            input=b'{}', stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=3, env={})
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr, b'operator-denied\n')

    def test_fixed_launcher_startup_in_disposable_chroot(self):
        # Red when the executable is missing, accepts arbitrary argv, imports
        # caller modules, uses an interpreter symlink, or cannot import the fixed
        # installed modules under -I. A synthetic wrong machine ID stops before
        # configuration/provider access; nothing is installed on the host.
        self.assertEqual(os.geteuid(), 0, 'startup regression requires root')
        from operator_adapter import MODULES
        with temporary() as directory:
            root = Path(directory)
            def copy(source, target):
                destination = root / target.lstrip('/')
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(Path(source).resolve(), destination)
                destination.chmod(Path(source).stat().st_mode & 0o777)
                return destination
            interpreter = copy(sys.executable, '/opt/social-monitor-release-python/bin/python3')
            copy('/bin/sh', '/bin/sh')
            copy('/usr/bin/env', '/usr/bin/env')
            stdlib = Path(sysconfig.get_path('stdlib'))
            shutil.copytree(stdlib, root / 'usr/lib' / stdlib.name,
                ignore=shutil.ignore_patterns('site-packages', 'dist-packages', '__pycache__',
                                             'test', 'tests', 'tkinter', 'idlelib', 'ensurepip'))
            # The real copied interpreter and stdlib extension modules need
            # their native loader/libraries inside this disposable filesystem.
            for binary in [sys.executable, '/bin/sh', '/usr/bin/env', *stdlib.glob('lib-dynload/*.so')]:
                result = subprocess.run(['/usr/bin/ldd', str(Path(binary).resolve())],
                    capture_output=True, text=True, timeout=5,
                    env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
                self.assertEqual(result.returncode, 0, result.stderr)
                for line in result.stdout.splitlines():
                    for word in line.split():
                        if word.startswith('/'):
                            copy(word, word)
            (root / 'opt/social-monitor-release-python/pyvenv.cfg').write_text(
                'home = /usr/bin\ninclude-system-site-packages = false\n')
            source = Path(__file__).parent
            for module in MODULES:
                copy(source / (module + '.py'), '/opt/social-monitor-release/' + module + '.py')
            copy(source / 'operator-adapter', '/etc/social-monitor/release/operator-adapter')
            (root / 'etc/machine-id').write_text('0' * 32 + '\n')
            untrusted = root / 'untrusted'
            untrusted.mkdir()
            poison = "from pathlib import Path; Path('/poison-imported').touch(); raise RuntimeError()\n"
            for module in ('sitecustomize', 'operator_adapter', 'contract'):
                (untrusted / (module + '.py')).write_text(poison)
            env = {'PATH': '/untrusted', 'PYTHONPATH': '/untrusted', 'PYTHONHOME': '/untrusted',
                   'PYTHONSTARTUP': '/untrusted/sitecustomize.py'}
            def invoke(args, raw=b'{}'):
                result = subprocess.run(['/usr/sbin/chroot', str(root),
                    '/etc/social-monitor/release/operator-adapter', *args], input=raw,
                    capture_output=True, timeout=8, env=env)
                self.assertEqual((result.returncode, result.stdout, result.stderr),
                                 (1, b'', b'operator-denied\n'))
                self.assertFalse((root / 'poison-imported').exists())
            for args in ([], ['--help'], ['preflight', '--config=/untrusted'],
                         ['/untrusted/observer'], ['postgres-identity']):
                invoke(args)
            # A real Python startup with the copied interpreter and fixed imports
            # reaches the finite request/machine fences without caller code.
            invoke(['postgres-identity'], b'{"unexpected":true}')
            # Fault a real fixed dependency inside the disposable installation.
            # A launcher that merely prints denial, drops -I/-B, or never reaches
            # these imports cannot produce this native parser failure.
            module = root / 'opt/social-monitor-release/operator_config.py'
            original = module.read_bytes()
            module.write_bytes(b'(\n')
            result = subprocess.run(['/usr/sbin/chroot', str(root),
                '/etc/social-monitor/release/operator-adapter', 'postgres-identity'],
                input=b'{}', capture_output=True, timeout=8, env=env)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stdout, b'')
            self.assertIn(b'SyntaxError', result.stderr)
            self.assertIn(b'/opt/social-monitor-release/operator_config.py', result.stderr)
            self.assertFalse((root / 'poison-imported').exists())
            module.write_bytes(original)
            copy(interpreter, '/opt/social-monitor-release-python/bin/copied-python')
            interpreter.unlink()
            interpreter.symlink_to('copied-python')
            invoke(['postgres-identity'])

    def test_root_private_configuration_closure_and_unknown_service_options(self):
        import operator_config as module
        config = FixtureConfig()
        # Exercise the production recheck method against real root-owned fixtures.
        config.recheck = lambda: Configuration.recheck(config)
        with temporary() as directory:
            root = Path(directory)
            exe, service, password, token, native = (root / name for name in
                ('observer-executable', 'service', 'pass', 'token', 'native'))
            exe.write_bytes(b'#!/bin/sh\nexit 1\n'); exe.chmod(0o700)
            service.write_bytes(b'[observer]\nhost=/var/run/postgresql\nport=5432\n'
                b'dbname=fixture_db\nuser=fixture_observer\nconnect_timeout=5\n')
            password.write_bytes(b'fixture-only-libpq-input')
            token.write_bytes(b'fixture_only_readonly_token_not_authority')
            native.write_bytes(b'[global]\nrepo1-type=posix\nrepo1-path=/fixture/repo\n')
            for path in (service, password, token): path.chmod(0o600)
            ghdir, includedir = root / 'gh-empty', root / 'include-empty'
            ghdir.mkdir(); includedir.mkdir()
            config.core['backup_identity']['wrapper'] = str(exe)
            config.core['backup_identity']['config_path'] = str(native)
            config.data['wrapper_sha256'] = sha_bytes(exe.read_bytes())
            config.data['backup_config_sha256'] = sha_bytes(native.read_bytes())
            with patch.object(module, 'EXECUTABLES', {key: str(exe) for key in module.EXECUTABLES}), \
                 patch.object(module, 'SERVICE', str(service)), patch.object(module, 'PASS', str(password)), \
                 patch.object(module, 'TOKEN', str(token)), patch.object(module, 'GH_DIR', str(ghdir)), \
                 patch.object(module, 'INCLUDE_DIR', str(includedir)):
                config.validate()
                self.assertEqual(config.inputs[str(native)], sha_bytes(native.read_bytes()))
                (includedir / 'untracked.conf').write_bytes(b'fixture')
                with self.assertRaises(Denied): config.recheck()
                (includedir / 'untracked.conf').unlink()
                service.write_bytes(service.read_bytes() + b'options=-c default_transaction_read_only=off\n')
                with self.assertRaises(Denied): config.validate()

    def test_unknown_configuration_and_discovery_placeholders_deny(self):
        config = FixtureConfig()
        for data in ({**config.data, 'extra': True}, {**config.data, 'version': True},
                     {**config.data, 'wrapper_sha256': 'DISCOVER'},
                     {**config.data, 'database': {**config.db, 'role': 'REPLACE_WITH_ROLE'}}):
            with self.assertRaises(Denied):
                Configuration(config.core, data)


class ProbeTests(unittest.TestCase):
    def fixture(self, change=None):
        target = {'id': CONTAINER, 'image': BINDING['image_id'], 'started': '2026-10-02T01:00:00Z',
                  'running': True, 'project': 'platform-social-monitor', 'service': 'api'}
        body = {'http_status': 200, 'body': {'status': 'ok', 'service': 'api-gateway',
                'runtime': {'metrics': {'exportState': 'failed'}}, 'checks': [
                {'name': 'postgres_runtime_pool', 'status': 'ok',
                 'detail': 'A query completed through the bounded shared Prisma pool.'},
                {'name': 'metrics', 'status': 'degraded'}]}}
        counter = [0]
        def provider(argv, data, env):
            if argv[1] == 'exec':
                self.assertEqual(argv[2], CONTAINER)
                self.assertEqual(argv[3:8], ['/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin',
                                            '/usr/local/bin/node', '--no-addons'])
                value = copy.deepcopy(body)
                if change:
                    change(value, None)
                return value
            counter[0] += 1
            value = copy.deepcopy(target)
            if change:
                change(None, value if counter[0] == 2 else None)
            return value
        return FixtureRunner(provider)

    def test_real_http_fixture_metrics_degraded_and_exact_core_contract(self):
        runner = self.fixture()
        binding = {'sha': BINDING['sha'], 'image_id': BINDING['image_id'], 'container_id': CONTAINER}
        result = decode(dispatch('probe', binding, FixtureConfig(), runner))
        self.assertTrue(result['ready'])
        self.assertTrue(result['postgres_pool_ok'])
        self.assertEqual(result['transport'], 'docker-exec-http')
        self.assertEqual(result['container_id'], CONTAINER)
        self.assertEqual(result['observed_at'], int(result['observed_at']))
        self.assertEqual(len(runner.calls), 3)

    def test_wrong_http_pool_skipped_duplicate_and_container_race_deny(self):
        def status(value, target):
            if value: value['http_status'] = 503
        def skipped(value, target):
            if value: value['body']['checks'][0]['detail'] = 'PostgreSQL probe was not executed.'
        def duplicate(value, target):
            if value: value['body']['checks'].append(value['body']['checks'][0])
        def restarted(value, target):
            if target: target['started'] = '2026-10-02T02:00:00Z'
        binding = {'sha': BINDING['sha'], 'image_id': BINDING['image_id'], 'container_id': CONTAINER}
        for change in (status, skipped, duplicate, restarted):
            with self.assertRaises(Denied):
                probe.probe(FixtureConfig(), self.fixture(change), binding)


class GitHubTests(unittest.TestCase):
    def fixture(self, modifier=None):
        run = {'id': 123, 'run_attempt': 2, 'workflow_id': 5, 'head_sha': BINDING['sha'],
               'head_branch': 'main', 'event': 'push', 'status': 'completed', 'conclusion': 'success',
               'repository': {'full_name': github.REPO}, 'head_repository': {'full_name': github.REPO}}
        jobs = [{'id': i + 1, 'name': name, 'run_id': 123, 'run_attempt': 2,
                 'head_sha': BINDING['sha'], 'status': 'completed', 'conclusion': 'success'}
                for i, name in enumerate(sorted(github.JOBS))]
        old = [{'path': 'libs/shared/kernel.ts', 'type': 'blob', 'mode': '100644', 'sha': '1' * 40}]
        new = [{'path': 'libs/shared/kernel.ts', 'type': 'blob', 'mode': '100644', 'sha': '2' * 40},
               {'path': 'docs/worker-notes.md', 'type': 'blob', 'mode': '100644', 'sha': '3' * 40}]
        def provider(argv, data, env):
            self.assertEqual(argv[1:6], ['api', '--hostname', 'github.com', '--method', 'GET'])
            self.assertNotIn('GITHUB_TOKEN', env)
            endpoint = argv[-1].split(github.REPO + '/', 1)[1]
            if endpoint == 'git/ref/heads/main':
                value = {'ref': 'refs/heads/main', 'object': {'type': 'commit', 'sha': BINDING['sha']}}
            elif endpoint == 'actions/workflows/production-deploy.yml':
                value = {'path': '.github/workflows/production-deploy.yml', 'state': 'disabled_manually'}
            elif endpoint == 'actions/workflows/' + github.CI:
                value = {'id': 5, 'path': '.github/workflows/' + github.CI, 'state': 'active'}
            elif endpoint == 'actions/runs/123': value = copy.deepcopy(run)
            elif '/jobs?' in endpoint:
                # Short pages are legal; total_count, not page length, closes pagination.
                page = int(endpoint.rsplit('=', 1)[1])
                value = {'total_count': len(jobs), 'jobs': copy.deepcopy(jobs[:8] if page == 1 else jobs[8:])}
            elif endpoint.startswith('git/commits/'):
                sha = endpoint.rsplit('/', 1)[1]
                value = {'sha': sha, 'tree': {'sha': '4' * 40 if sha == BASE else '5' * 40}}
            elif endpoint.startswith('git/trees/'):
                is_old = '4' * 40 in endpoint
                value = {'sha': '4' * 40 if is_old else '5' * 40, 'truncated': False,
                         'tree': copy.deepcopy(old if is_old else new)}
            else: self.fail('unexpected fixture command')
            if modifier: modifier(endpoint, value)
            return value
        return FixtureRunner(provider)

    def test_complete_paginated_jobs_delta_review_and_core_consumer(self):
        config, runner = FixtureConfig(), self.fixture()
        binding = {**BINDING, 'production_revision': BASE}
        with temporary() as directory:
            token, review = Path(directory) / 'token', Path(directory) / 'review'
            token.write_bytes(b'fixture_token_is_not_authority'); token.chmod(0o600)
            with patch.object(github, 'TOKEN', str(token)), patch.object(github, 'REVIEW', str(review)):
                paths, delta = github.GitHub(config, runner).delta(BASE, BINDING['sha'])
                review.write_bytes(canonical({'version': 1, 'base': BASE, 'head': BINDING['sha'],
                    'delta_sha256': delta, 'paths_sha256': digest(paths), 'independent_review': True,
                    'all_shared_dependencies_reviewed': True, 'compatible': True}))
                result = decode(dispatch('release-evidence', binding, config, runner))
                self.assertEqual(result['jobs'], ['success'] * len(github.JOBS))
                self.assertEqual({j['name'] for j in result['job_observations']}, github.JOBS)
                self.assertEqual(result['changed_paths'], ['docs/worker-notes.md', 'libs/shared/kernel.ts'])
                self.assertEqual(result['compatibility']['evidence_sha256'], sha_bytes(review.read_bytes()))
                self.assertTrue(result['api_only'])
                self.assertFalse(result['worker_sensitive_changed'])
                import evidence
                evidence.compatibility(result, BASE, BINDING['sha'])
                review.unlink()
                with self.assertRaises((Denied, OSError)):
                    github.release(FixtureConfig(), runner, binding)

    def test_run_attempt_missing_jobs_truncated_tree_and_scope_denials(self):
        def wrong_attempt(endpoint, value):
            if '/jobs?' in endpoint and value['jobs']: value['jobs'][0]['run_attempt'] = 1
        def missing(endpoint, value):
            if '/jobs?' in endpoint:
                value['jobs'] = [j for j in value['jobs'] if j['name'] != 'Backend end-to-end tests']
                value['total_count'] = len(github.JOBS) - 1
        def failed(endpoint, value):
            if '/jobs?' in endpoint and value['jobs']: value['jobs'][0]['conclusion'] = 'skipped'
        def truncated(endpoint, value):
            if endpoint.startswith('git/trees/'): value['truncated'] = True
        with temporary() as directory:
            token = Path(directory) / 'token'
            token.write_bytes(b'fixture_token_is_not_authority'); token.chmod(0o600)
            with patch.object(github, 'TOKEN', str(token)):
                for change in (wrong_attempt, missing, failed):
                    gh = github.GitHub(FixtureConfig(), self.fixture(change))
                    with self.assertRaises(Denied): gh.jobs(gh.run('123', BINDING['sha']))
                with self.assertRaises(Denied):
                    github.GitHub(FixtureConfig(), self.fixture(truncated)).delta(BASE, BINDING['sha'])
        for path in ('apps/agent-runtime/x.spec.ts', 'prisma/migrations/x.sql', 'ops/compose/compose.yml'):
            self.assertFalse(github.scope([path])['api_only'])
        self.assertTrue(github.scope(['docs/worker-api-guide.md'])['api_only'])


if __name__ == '__main__':
    unittest.main()
