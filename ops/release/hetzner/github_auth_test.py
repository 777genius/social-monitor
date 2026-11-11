"""Synthetic short-lived credentials only; no GitHub, SSH or production calls."""
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from contract import Denied, canonical
from controller import Controller
import operator_config as config
from operator_github import GitHub

SHA, RUN, LEASE = 'a' * 40, '123', 'b' * 32
TOKEN = 'TEST_ONLY_NOT_A_CREDENTIAL_0000'


class AuthTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='TEST-github-auth-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        for name, replacement in (
            ('AUTH_ROOT', self.root / 'auth'),
            ('trusted', lambda path, directory=False: Path(path)),
            ('private_file_digest', lambda path: config.sha_bytes(Path(path).read_bytes())),
        ):
            mock = patch.object(config, name, replacement); mock.start(); self.addCleanup(mock.stop)

    def install(self, lease=LEASE):
        return config.github_auth_update(SHA, RUN, canonical({'lease': lease, 'token': TOKEN}))

    def observer(self):
        class Config:
            github_binding = {'sha': SHA, 'ci_run_id': RUN}
            recheck = lambda self: None
            pin = lambda self, path, expected: None
        return Config()

    def test_private_binding_header_and_exact_lease_cleanup(self):
        self.assertEqual(self.install(), {'sha': SHA, 'ci_run_id': RUN, 'configured': True})
        path = config.auth_path(SHA, RUN)
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(config.AUTH_ROOT.stat().st_mode & 0o777, 0o700)
        class Runner:
            def run(self, argv, **kwargs):
                self.argv, self.options = argv, kwargs
                return b'{}'
        runner = Runner()
        self.assertEqual(GitHub(self.observer(), runner).get(''), {})
        self.assertNotIn(TOKEN, repr(runner.argv))
        self.assertEqual(runner.options['data'], ('Authorization: Bearer ' + TOKEN + '\n').encode())
        self.assertEqual(runner.options['env'], {})
        self.assertEqual(runner.argv[-3:-1], ['--header', '@-'])
        self.install('c' * 32)
        self.assertFalse(config.github_auth_update(SHA, RUN, canonical({'lease': LEASE}), clear=True)['cleared'])
        self.assertTrue(path.exists())
        self.assertTrue(config.github_auth_update(SHA, RUN, canonical({'lease': 'c' * 32}), clear=True)['cleared'])
        self.assertFalse(path.exists())

    def test_missing_expired_foreign_or_public_credential_never_calls_curl(self):
        class Runner:
            def run(self, *args, **kwargs): raise AssertionError('unexpected GitHub request')
        with self.assertRaises(FileNotFoundError): GitHub(self.observer(), Runner()).get('')
        self.install(); path = config.auth_path(SHA, RUN)
        good = json.loads(path.read_bytes())
        for change in ({'expires_at': int(time.time()) - 1}, {'expires_at': True}, {'ci_run_id': '456'},
                       {'token': TOKEN + '\nInjected: header'}):
            path.write_bytes(canonical({**good, **change}))
            with self.assertRaises(Denied): GitHub(self.observer(), Runner()).get('')
        path.write_bytes(canonical(good)); path.chmod(0o644)
        with self.assertRaises(Denied): GitHub(self.observer(), Runner()).get('')

    def test_invalid_payload_and_symlink_cannot_store_or_clear_secrets(self):
        for payload in ({'lease': LEASE, 'token': TOKEN + '\n'}, {'lease': LEASE, 'token': 'x' * 2049},
                        {'lease': '../path', 'token': TOKEN}, {'lease': LEASE, 'token': TOKEN, 'extra': True}):
            with self.assertRaises(Denied): config.github_auth_update(SHA, RUN, canonical(payload))
        with self.assertRaises(Denied): config.github_auth_update(SHA, RUN, b'x' * 4097)
        self.install()
        path = config.auth_path(SHA, RUN); path.unlink(); path.symlink_to(self.root / 'missing')
        with self.assertRaises(Denied): config.github_auth_update(SHA, RUN, canonical({'lease': LEASE}), clear=True)

    def test_invalid_remote_token_is_not_retried_anonymously(self):
        self.install()
        class Runner:
            calls = 0
            def run(self, argv, **kwargs):
                self.calls += 1
                raise Denied('operator-command-failed')
        runner = Runner()
        with self.assertRaises(Denied): GitHub(self.observer(), runner).get('')
        self.assertEqual(runner.calls, 1)

    def test_cohort_routes_require_auth_but_recovery_probes_do_not(self):
        from operator_adapter import dispatch
        class Runner:
            end = time.monotonic() + 5
            def run(self, *args, **kwargs): raise AssertionError('unexpected request')
        observer = self.observer()
        for verb in ('cohort-frontend-authority', 'cohort-backend-release-evidence'):
            with self.assertRaises(FileNotFoundError):
                dispatch(verb, {'sha': SHA, 'ci_run_id': RUN}, observer, Runner())
        with patch('operator_probe.worker_probe', return_value={'ready': True}):
            dispatch('worker-probe', {}, observer, Runner())
        self.assertIsNone(observer.github_binding)

    def test_legacy_authority_and_backend_evidence_stay_anonymous(self):
        from operator_adapter import dispatch
        class Runner:
            end = time.monotonic() + 5
            def run(self, argv, **kwargs):
                self.data = kwargs['data']; return b'{}'
        observer, runner = self.observer(), Runner()
        def legacy(config, runner, binding):
            return GitHub(config, runner).get('')
        for verb, handler in (('frontend-authority', 'frontend_authority.frontend_authority'),
                              ('backend-release-evidence', 'operator_github.backend_release')):
            with patch(handler, side_effect=legacy):
                dispatch(verb, {'sha': SHA, 'ci_run_id': RUN}, observer, runner)
            self.assertIsNone(runner.data)
            self.assertIsNone(observer.github_binding)

    def test_expired_full_capacity_is_pruned_before_new_ingress(self):
        self.install(); path = config.auth_path(SHA, RUN)
        saved = json.loads(path.read_bytes()); path.unlink()
        for run in range(1, 33):
            config.atomic(config.auth_path(SHA, str(run)),
                          {**saved, 'ci_run_id': str(run), 'expires_at': int(time.time()) - 1})
        self.install()
        self.assertEqual(list(config.AUTH_ROOT.iterdir()), [path])

    def test_prune_preserves_active_foreign_invalid_public_and_unrelated_files(self):
        self.install(); active = config.auth_path(SHA, RUN)
        expired = {**json.loads(active.read_bytes()), 'expires_at': int(time.time()) - 1}
        paths = {name: config.auth_path(SHA, str(index)) for index, name in
                 enumerate(('valid', 'foreign', 'invalid', 'public', 'symlink', 'oversized'), 1)}
        for index, (name, path) in enumerate(paths.items(), 1):
            config.atomic(path, {**expired, 'ci_run_id': str(index)})
        paths['invalid'].write_bytes(b'{}'); paths['public'].chmod(0o644)
        paths['oversized'].write_bytes(b'x' * 4097)
        paths['symlink'].unlink(); paths['symlink'].symlink_to(active)
        unrelated = config.AUTH_ROOT / 'unrelated'; unrelated.write_text('preserve')
        original = config.private_file_digest
        def custody(path):
            if Path(path) == paths['oversized']: raise AssertionError('oversized file was hashed')
            if Path(path) == paths['foreign']: raise Denied('untrusted-installation')
            return original(path)
        with patch.object(config, 'private_file_digest', side_effect=custody):
            self.install()
        self.assertFalse(paths['valid'].exists())
        self.assertTrue(all(path.exists() for name, path in paths.items() if name != 'valid'))
        self.assertTrue(active.exists() and unrelated.exists())

    def test_controller_fixed_dispatch_fence_interlock_and_latched_cleanup(self):
        (self.root / 'controller.lock').touch()
        core = Controller({'state': str(self.root), 'inbox': str(self.root / 'inbox')}, None)
        core.fence = lambda: None
        calls = []
        core.exclusive = lambda key: calls.append(key)
        with patch('operator_adapter.read_request', return_value=canonical({'lease': LEASE, 'token': TOKEN})):
            core.dispatch('github-auth ' + SHA + ' ' + RUN, io.BytesIO())
        self.assertEqual(calls, ['cohort-' + SHA + '-' + RUN])
        (self.root / 'latch.json').write_text('{}')
        with self.assertRaisesRegex(Denied, 'latched'): core.dispatch('github-auth ' + SHA + ' ' + RUN)
        with patch('operator_adapter.read_request', return_value=canonical({'lease': LEASE})):
            self.assertTrue(core.dispatch('github-auth-clear ' + SHA + ' ' + RUN)['cleared'])
        with self.assertRaises(Denied): core.dispatch('github-auth ' + SHA + ' ' + RUN + ' extra')


if __name__ == '__main__': unittest.main()
