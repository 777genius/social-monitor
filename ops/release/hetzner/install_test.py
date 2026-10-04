"""Synthetic input/plan proofs only. Never call install(), venv, sudo or useradd."""
import contextlib
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import install


class BootstrapInputs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def file(self, name, data=b'synthetic', mode=0o600):
        path = self.root / name
        path.write_bytes(data)
        path.chmod(mode)
        return path

    def test_plan_missing_adapter_performs_no_commands_or_install(self):
        # Regression: a default invocation must never provision any asset or account.
        with patch.object(install, 'run', side_effect=AssertionError('command')), \
                patch.object(install, 'install', side_effect=AssertionError('install')), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            code = install.main(['--source', str(self.root), '--approved-sha', 'a' * 40,
                                 '--public-key', str(self.root / 'key'),
                                 '--pyyaml-wheel', str(self.root / 'wheel')])
        result = json.loads(output.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(result['mode'], 'plan')
        self.assertFalse(result['ready'])
        self.assertEqual(result['blockers'], ['approved-adapter-missing'])
        self.assertEqual(list(self.root.iterdir()), [])

    def test_actual_cli_default_is_plan_and_requires_isolated_startup(self):
        # This executes only the plan on empty synthetic source. No --install invocation.
        argv = [str(Path(install.__file__).resolve()), '--source', str(self.root),
                '--approved-sha', 'a' * 40, '--public-key', str(self.root / 'public'),
                '--pyyaml-wheel', str(self.root / 'wheel')]
        result = subprocess.run([sys.executable, '-I', '-B', *argv], check=False,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['mode'], 'plan')
        self.assertEqual(json.loads(result.stdout)['blockers'], ['approved-adapter-missing'])
        self.assertEqual(result.stderr, b'')
        unsafe = subprocess.run([sys.executable, '-B', *argv], check=False,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10,
                                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
        self.assertEqual(unsafe.returncode, 1)
        self.assertEqual(json.loads(unsafe.stdout)['reason'], 'isolated-python-required')
        self.assertEqual(list(self.root.iterdir()), [])

    def test_argument_errors_never_echo_untrusted_values(self):
        with contextlib.redirect_stdout(io.StringIO()) as output, \
                contextlib.redirect_stderr(io.StringIO()) as errors:
            with self.assertRaises(SystemExit) as denied:
                install.main(['--unknown=SYNTHETIC_PRIVATE_PAYLOAD'])
        self.assertEqual(denied.exception.code, 2)
        self.assertEqual(json.loads(output.getvalue()), {'phase': 'denied', 'reason': 'arguments'})
        self.assertEqual(errors.getvalue(), '')

    def test_private_regular_files_and_ancestors(self):
        path = self.file('config')
        self.assertEqual(install.bounded(path, private=True), b'synthetic')
        path.chmod(0o644)
        with self.assertRaises(install.Denied):
            install.bounded(path, private=True)
        alias = self.root / 'alias'
        alias.symlink_to(path)
        with self.assertRaises(install.Denied):
            install.bounded(alias)
        with self.assertRaises(install.Denied):
            install.bounded(self.root)
        self.root.chmod(0o777)
        with self.assertRaises(install.Denied):
            install.bounded(path)
        self.root.chmod(0o700)

    def test_placeholders_and_unbounded_config_deny(self):
        c = self.file('components', b'{"version":1,"project":"REPLACE_ME"}')
        o = self.file('operator', b'{"version":1}')
        with self.assertRaisesRegex(install.Denied, 'config-placeholder'):
            install.configuration(c, o)
        large = self.file('large', b'x' * 100)
        with self.assertRaisesRegex(install.Denied, 'file-bounds'):
            install.bounded(large, 99)

    def test_sudoers_has_no_argument_rule_and_preserves_only_bounded_command(self):
        rule = install.sudoers().decode()
        self.assertEqual(rule, 'Defaults:sm-release env_reset,!setenv\n'
                         'Defaults:sm-release env_keep += "SSH_ORIGINAL_COMMAND"\n'
                         'sm-release ALL=(root) NOPASSWD: /opt/social-monitor-release/root-executor ""\n')
        self.assertNotIn('SETENV:', rule)

    def test_authorized_key_restricts_exact_forced_command(self):
        import base64
        data = b'\0\0\0\x0bssh-ed25519\0\0\0\x20' + bytes(range(32))
        public = 'ssh-ed25519 ' + base64.b64encode(data).decode()
        path = self.file('public', public.encode())
        self.assertEqual(install.public_key(path), 'restrict,command="/usr/bin/sudo -n '
                         '/opt/social-monitor-release/root-executor" ' + public + '\n')
        for invalid in ['environment="X=1" ' + public, public + '\n' + public,
                        public + ' arbitrary-comment', 'ssh-ed25519 YQ==']:
            path.write_text(invalid)
            with self.assertRaises(install.Denied):
                install.public_key(path)

    def test_git_seam_requires_head_index_and_working_bytes_without_hooks(self):
        area = self.root / 'ops/release/hetzner'
        area.mkdir(parents=True)
        source = area / 'controller.py'
        source.write_bytes(b'approved-synthetic-source\n')
        blob = hashlib.sha1(b'blob 26\0approved-synthetic-source\n').hexdigest()
        # Independently computed constant byte length; mismatch would fail the clean proof.
        self.assertEqual(len(source.read_bytes()), 26)
        calls = []
        def git(argv):
            calls.append(argv)
            if 'rev-parse' in argv:
                return ('a' * 40 + '\n').encode()
            if 'ls-files' in argv:
                return ('100644 ' + blob + ' 0\tops/release/hetzner/controller.py\0').encode()
            if 'ls-tree' in argv:
                return ('100644 blob ' + blob + '\tops/release/hetzner/controller.py\0').encode()
            raise AssertionError('Unexpected command')
        install.git_check(self.root, 'a' * 40, ['controller.py'], git)
        self.assertTrue(all('core.hooksPath=/dev/null' in c and 'core.fsmonitor=false' in c for c in calls))
        self.assertFalse(any('diff' in c or 'status' in c for c in calls))
        source.write_bytes(b'changed-synthetic-source\n')
        with self.assertRaisesRegex(install.Denied, 'source-dirty'):
            install.git_check(self.root, 'a' * 40, ['controller.py'], git)
        with self.assertRaisesRegex(install.Denied, 'source-head'):
            install.git_check(self.root, 'b' * 40, ['controller.py'], git)

    # Red: omitting the shared policy permits an installation without the mandatory verifier.
    def test_history_policy_inventory_and_actual_installed_bytes_are_bound(self):
        self.assertIn('prisma_history.py', install.BASE_FILES + install.OPERATOR_FILES)
        area = self.root / 'ops/release/hetzner'; area.mkdir(parents=True)
        source = area / 'prisma_history.py'
        source.write_bytes(Path(install.__file__).with_name('prisma_history.py').read_bytes())
        data = source.read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        def git(argv):
            if 'rev-parse' in argv: return ('a'*40 + '\n').encode()
            if 'ls-files' in argv:
                return ('100644 ' + blob + ' 0\tops/release/hetzner/prisma_history.py\0').encode()
            if 'ls-tree' in argv:
                return ('100644 blob ' + blob + '\tops/release/hetzner/prisma_history.py\0').encode()
            raise AssertionError('unexpected Git read')
        assets = install.git_check(self.root, 'a'*40, ['prisma_history.py'], git)
        destination = self.root / 'installed-history.py'
        install.write_new(destination, assets['prisma_history.py'], 0o644)
        self.assertEqual(destination.read_bytes(), data)
        source.write_bytes(data + b'\n# altered\n')
        with self.assertRaisesRegex(install.Denied, 'source-dirty'):
            install.git_check(self.root, 'a'*40, ['prisma_history.py'], git)

    def test_new_asset_mode_ignores_umask_and_preserves_existing_assets(self):
        import os
        import stat
        path = self.root / 'synthetic-executor'
        prior = os.umask(0o077)
        try:
            install.write_new(path, b'synthetic', 0o755)
        finally:
            os.umask(prior)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o755)
        with self.assertRaises(FileExistsError):
            install.write_new(path, b'replace', 0o700)
        self.assertEqual(path.read_bytes(), b'synthetic')
        with self.assertRaises(install.Denied):
            install.absent(path)

    def test_venv_trust_removes_only_cpython_self_alias_and_denies_other_links(self):
        # Plain synthetic files/directories only: no venv construction or install.
        environment = self.root / 'synthetic-python'
        (environment / 'bin').mkdir(parents=True)
        (environment / 'lib').mkdir()
        (environment / 'bin/python3').write_bytes(b'synthetic-non-interpreter')
        (environment / 'lib64').symlink_to('lib')
        install.secure_venv(environment)
        self.assertFalse((environment / 'lib64').is_symlink())
        (environment / 'bin/python3').unlink()
        (environment / 'bin/python3').symlink_to('/synthetic/untrusted-python')
        with self.assertRaises(install.Denied):
            install.secure_venv(environment)

    def test_venv_alias_cannot_escape_and_writable_dependencies_deny(self):
        environment = self.root / 'synthetic-python'
        (environment / 'bin').mkdir(parents=True)
        (environment / 'lib').mkdir()
        (environment / 'bin/python3').write_bytes(b'synthetic-non-interpreter')
        alias = environment / 'lib64'
        alias.symlink_to('../outside')
        with self.assertRaisesRegex(install.Denied, 'venv-alias'):
            install.secure_venv(environment)
        self.assertTrue(alias.is_symlink())
        alias.unlink()
        (environment / 'lib').chmod(0o777)
        with self.assertRaises(install.Denied):
            install.secure_venv(environment)

    def test_run_env_is_static_and_discards_raw_failure(self):
        import subprocess
        with patch.object(install.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1,
                b'SYNTHETIC_PRIVATE_PAYLOAD', b'SYNTHETIC_PRIVATE_ERROR')) as execute:
            with self.assertRaisesRegex(install.Denied, '^command-failed$'):
                install.run(['/synthetic/program'])
        kwargs = execute.call_args.kwargs
        self.assertEqual(kwargs['env']['GIT_CONFIG_GLOBAL'], '/dev/null')
        self.assertNotIn('LD_PRELOAD', kwargs['env'])
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
        self.assertFalse(kwargs['check'])


if __name__ == '__main__':
    unittest.main()
