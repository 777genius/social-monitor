"""Offline fixed-path lifecycle in disposable chroots, with real stdin and flock."""
import fcntl
import json
import os
from pathlib import Path
import select
import signal
import stat
import tempfile
import time
import unittest
from contract import Denied, MACHINE, load_config, parse
from controller import Controller
from operator_adapter import MODULES
from operator_config import EXECUTABLES, SYSTEM_ID, sha_bytes
import observer_token
from unittest.mock import patch
from test_support import setup

TOKEN = b'TEST_ONLY_OPAQUE_JOB_TOKEN_000000'


class NoEffects:
    def __getattr__(self, name):
        raise AssertionError('credential-setup-image-effect')


class ObserverTokenTests(unittest.TestCase):
    # Red before implementation: grammar denies observer-token and no job token
    # can bootstrap the real fixed observer config without a preexisting token.
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.token-test-',
            dir=Path(__file__).resolve().parents[3] / 'node_modules')
        self.root = Path(self.temp.name)
        pid = os.fork()
        if pid == 0:
            try:
                os.chroot(self.root)
                os._exit(0)
            except PermissionError:
                os._exit(77)
        _, status = os.waitpid(pid, 0)
        if os.waitstatus_to_exitcode(status) == 77:
            self.temp.cleanup()
            self.skipTest('sandbox denies chroot (EPERM); root primary must run fixed-path integration')
        sandbox = self.root / 'sandbox'
        sandbox.mkdir()
        setup(sandbox)
        core = json.loads((sandbox / 'config.json').read_bytes())
        core.update(version=1, environment='production-hetzner', project='platform-social-monitor',
                    project_directory='/srv/platform/projects/social-monitor')
        self.at(core['project_directory']).mkdir(parents=True)
        for key in ('state', 'inbox'):
            core[key] = core[key].removeprefix(str(self.root))
        for key in ('compose_files', 'env_files'):
            core[key] = [p.removeprefix(str(self.root)) for p in core[key]]
        core['adapter'] = '/etc/social-monitor/release/operator-adapter'
        core['backup_identity'].update(config_path='/etc/pgbackrest/production-main.conf',
            stanza='production-main', system_identifier=SYSTEM_ID)
        self.file('/etc/machine-id', MACHINE.encode())
        self.file('/etc/social-monitor/release/components.conf', json.dumps(core).encode())
        self.file('/etc/social-monitor/release/operator-adapter', b'#!/bin/sh\nexit 1\n', 0o700)
        self.file('/etc/pgbackrest/production-main.conf', b'TEST_ONLY_BACKUP_CONFIG')
        for path in EXECUTABLES.values():
            self.file(path, b'#!/bin/sh\nexit 1\n', 0o700)
        data = {'version': 1, 'database': {'service': 'observer', 'database': 'fixture_db',
            'role': 'fixture_observer', 'host': '/var/run/postgresql', 'port': '5432'},
            'wrapper_sha256': sha_bytes(self.at(EXECUTABLES['backup']).read_bytes()),
            'backup_config_sha256': sha_bytes(self.at(core['backup_identity']['config_path']).read_bytes())}
        self.file('/etc/social-monitor/release/operator.conf', json.dumps(data).encode())
        self.file('/etc/social-monitor/release/observer.pg_service.conf',
            b'[observer]\nhost=/var/run/postgresql\nport=5432\ndbname=fixture_db\n'
            b'user=fixture_observer\nconnect_timeout=5\n')
        self.file('/etc/social-monitor/release/observer.pgpass', b'TEST_ONLY_LIBPQ_INPUT')
        for name in ('github-empty', 'pgbackrest-empty'):
            self.at('/etc/social-monitor/release/' + name).mkdir()
        self.file('/opt/social-monitor-release-python/bin/python3', b'TEST_ONLY_PINNED_INTERPRETER')
        self.file('/opt/social-monitor-release-python/pyvenv.cfg', b'TEST_ONLY_PINNED_CONFIG')
        for name in MODULES:
            self.file('/opt/social-monitor-release/' + name + '.py',
                      Path(__file__).with_name(name + '.py').read_bytes())
        self.token = self.at('/etc/social-monitor/release/github-readonly.token')

    def tearDown(self):
        self.temp.cleanup()

    def at(self, path):
        return self.root / path.lstrip('/')

    def file(self, path, data, mode=0o600):
        target = self.at(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(mode)

    def invoke(self, raw=TOKEN, eof=True, verb='observer-token', ordinary=False):
        source, writer = os.pipe()
        reader, result = os.pipe()
        pid = os.fork()
        if pid == 0:
            os.close(writer); os.close(reader)
            try:
                os.chroot(self.root); os.chdir('/')
                with os.fdopen(source, 'rb', buffering=0) as stream:
                    if ordinary:
                        from operator_config import load
                        load()
                        value = {'unexpected': True}
                    else:
                        value = Controller(load_config(), NoEffects()).dispatch(verb, stream)
                value = {'result': value}
            except Denied as error:
                value = {'denied': str(error)}
            except Exception:
                value = {'denied': 'invalid-host-state'}
            os.write(result, json.dumps(value).encode())
            os._exit(0)
        os.close(source); os.close(result)
        try:
            os.write(writer, raw)
            if eof:
                os.close(writer); writer = None
            self.assertTrue(select.select([reader], [], [], 8)[0], 'child deadline')
            return json.loads(os.read(reader, 65536))
        finally:
            if writer is not None:
                os.close(writer)
            os.close(reader)
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)

    def test_fixed_path_creation_rotation_and_permissions(self):
        before = {p.relative_to(self.root) for p in self.root.rglob('*')}
        self.assertEqual(self.invoke(), {'result': {'observer_token': 'configured'}})
        self.assertEqual(self.token.read_bytes(), TOKEN)
        self.assertEqual(stat.S_IMODE(self.token.stat().st_mode), 0o600)
        self.assertEqual(self.token.stat().st_uid, 0)
        self.assertEqual({p.relative_to(self.root) for p in self.root.rglob('*')} - before,
                         {Path('etc/social-monitor/release/github-readonly.token')})
        inode = self.token.stat().st_ino
        self.assertEqual(self.invoke(b'TEST_ONLY_ROTATED_JOB_TOKEN_1111'),
                         {'result': {'observer_token': 'configured'}})
        self.assertNotEqual(self.token.stat().st_ino, inode)
        self.assertEqual(self.token.read_bytes(), b'TEST_ONLY_ROTATED_JOB_TOKEN_1111')
        self.assertEqual(stat.S_IMODE(self.token.stat().st_mode), 0o600)

    # Red if update follows aliases, repairs unsafe owners/modes, or trusts a
    # writable installation. The original file must survive each denial.
    def test_unsafe_existing_destination_and_installation(self):
        self.token.write_bytes(TOKEN)
        for mode in (0o644, 0o620, 0o602, 0o400):
            self.token.chmod(mode)
            self.assertIn('denied', self.invoke())
            self.assertEqual(self.token.read_bytes(), TOKEN)
        self.token.chmod(0o600)
        os.chown(self.token, 12345, 12345)
        self.assertIn('denied', self.invoke())
        os.chown(self.token, 0, 0)
        self.token.unlink()
        target = self.at('/untouched'); target.write_bytes(b'TEST_ONLY_UNTOUCHED')
        self.token.symlink_to('/untouched')
        self.assertIn('denied', self.invoke())
        self.assertEqual(target.read_bytes(), b'TEST_ONLY_UNTOUCHED')
        self.token.unlink(); self.token.mkdir()
        self.assertIn('denied', self.invoke())
        self.token.rmdir()
        for path in (self.token.parent, self.at('/opt/social-monitor-release/observer_token.py')):
            mode = path.stat().st_mode
            path.chmod(mode | 0o020)
            self.assertIn('denied', self.invoke())
            path.chmod(mode)
        parent = self.token.parent
        parent.rename(parent.with_name('release-real'))
        parent.symlink_to('release-real')
        self.assertIn('denied', self.invoke())

    # Red if malformed/oversized bytes or exact-size bytes without EOF become
    # a credential; a single total deadline must release the actual flock.
    def test_input_bounds_eof_deadline_and_lock_contention(self):
        for raw in (b'', b'TEST_SHORT', TOKEN + b'\n', TOKEN + b'!', b'\xff' * 20, b'A' * 4097):
            self.assertIn('denied', self.invoke(raw))
            self.assertFalse(self.token.exists())
        start = time.monotonic()
        self.assertIn('denied', self.invoke(TOKEN, eof=False))
        self.assertLess(time.monotonic() - start, 7)
        self.assertGreater(time.monotonic() - start, 4)
        with (self.root / 'sandbox/state/controller.lock').open('rb') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.invoke(), {'denied': 'busy'})
        self.assertEqual(self.invoke(b'A' * 4096), {'result': {'observer_token': 'configured'}})

    def test_no_request_paths_and_no_optional_observer_token(self):
        for wire in ('observer-token /tmp/token', 'observer-token ', 'observer-token\n',
                     'observer-token --path=x'):
            with self.assertRaises(Denied): parse(wire)
        self.assertIn('denied', self.invoke(ordinary=True))
        # Run the real ordinary loader in a chroot: missing token still denies.
        # A missing trusted module must also block bootstrap before token creation.
        self.at('/opt/social-monitor-release/operator_probe.py').unlink()
        self.assertIn('denied', self.invoke())
        self.assertFalse(self.token.exists())


class PortableLifecycleTests(unittest.TestCase):
    # Red if the real writer leaks to another path, preserves unsafe destinations,
    # omits either fsync, or the real pipe accepts bytes without bounded EOF.
    def test_real_writer_and_unsafe_destinations(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3] / 'node_modules') as d:
            root = Path(d)
            token = root / 'github-readonly.token'
            with patch.object(observer_token, 'TOKEN', str(token)):
                synced = []
                fsync = os.fsync
                def observe_sync(fd):
                    synced.append(stat.S_IFMT(os.fstat(fd).st_mode))
                    fsync(fd)
                with patch.object(observer_token.os, 'fsync', observe_sync):
                    observer_token.publish(TOKEN)
                self.assertEqual(synced, [stat.S_IFREG, stat.S_IFDIR])
                self.assertEqual(token.read_bytes(), TOKEN)
                self.assertEqual(stat.S_IMODE(token.stat().st_mode), 0o600)
                self.assertEqual(token.stat().st_uid, 0)
                observer_token.publish(b'TEST_ONLY_ROTATED_JOB_TOKEN_1111')
                self.assertEqual(token.read_bytes(), b'TEST_ONLY_ROTATED_JOB_TOKEN_1111')
                self.assertEqual(list(root.iterdir()), [token])
                for mode in (0o644, 0o620, 0o602, 0o400):
                    token.chmod(mode)
                    with self.assertRaises(Denied): observer_token.publish(TOKEN)
                token.unlink()
                target = root / 'untouched'; target.write_bytes(b'TEST_ONLY_UNTOUCHED')
                token.symlink_to(target)
                with self.assertRaises(Denied): observer_token.publish(TOKEN)
                self.assertEqual(target.read_bytes(), b'TEST_ONLY_UNTOUCHED')
                token.unlink(); token.mkdir()
                with self.assertRaises(Denied): observer_token.publish(TOKEN)
                token.rmdir()
                token.write_bytes(TOKEN); token.chmod(0o600)
                os.link(token, root / 'hardlink')
                with self.assertRaises(Denied): observer_token.publish(TOKEN)
                token.unlink(); (root / 'hardlink').unlink()
                root.chmod(0o720)
                with self.assertRaises(Denied): observer_token.publish(TOKEN)
                root.chmod(0o700)
                alias = root / 'alias'; alias.symlink_to(root, target_is_directory=True)
                with patch.object(observer_token, 'TOKEN', str(alias / 'github-readonly.token')):
                    with self.assertRaises(Denied): observer_token.publish(TOKEN)

    # Red if a failed file fsync publishes an undurable token or leaves private
    # staging bytes behind. Exercise the actual writer with an injected I/O fault.
    def test_failed_file_sync_preserves_previous_token_and_cleans_staging(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3] / 'node_modules') as d:
            root = Path(d)
            token = root / 'github-readonly.token'
            token.write_bytes(TOKEN); token.chmod(0o600)
            inode = token.stat().st_ino
            with patch.object(observer_token, 'TOKEN', str(token)), \
                 patch.object(observer_token.os, 'fsync', side_effect=OSError('TEST_ONLY_IO_FAILURE')):
                with self.assertRaises(OSError):
                    observer_token.publish(b'TEST_ONLY_ROTATED_JOB_TOKEN_1111')
            self.assertEqual(token.read_bytes(), TOKEN)
            self.assertEqual(token.stat().st_ino, inode)
            self.assertEqual(stat.S_IMODE(token.stat().st_mode), 0o600)
            self.assertEqual(list(root.iterdir()), [token])

    def test_real_pipe_limits_total_deadline_and_controller_lock(self):
        for raw in (TOKEN, b'A' * 4096, b'', b'TEST_SHORT', TOKEN + b'\n',
                    b'\xff' * 20, b'A' * 4097):
            reader, writer = os.pipe()
            try:
                os.write(writer, raw); os.close(writer)
                with os.fdopen(reader, 'rb', buffering=0) as stream:
                    if raw in (TOKEN, b'A' * 4096):
                        self.assertEqual(observer_token.capture(stream), raw)
                    else:
                        with self.assertRaises(Denied): observer_token.capture(stream)
            finally:
                pass
        reader, writer = os.pipe()
        try:
            os.write(writer, TOKEN)
            start = time.monotonic()
            with os.fdopen(reader, 'rb', buffering=0) as stream:
                with self.assertRaises(Denied): observer_token.capture(stream)
            self.assertGreater(time.monotonic() - start, 4)
            self.assertLess(time.monotonic() - start, 7)
        finally:
            os.close(writer)
        reader, writer = os.pipe()
        pid = os.fork()
        if pid == 0:
            os.close(reader)
            for byte in TOKEN:
                os.write(writer, bytes([byte]))
                time.sleep(0.2)
            os.close(writer)
            os._exit(0)
        os.close(writer)
        try:
            start = time.monotonic()
            with os.fdopen(reader, 'rb', buffering=0) as stream:
                with self.assertRaises(Denied): observer_token.capture(stream)
            self.assertLess(time.monotonic() - start, 6)
        finally:
            os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3] / 'node_modules') as d:
            root = Path(d); setup(root)
            core = json.loads((root / 'config.json').read_bytes())
            class SandboxController(Controller):
                def identity(self): return MACHINE
            with (root / 'state/controller.lock').open('rb') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(Denied, '^busy$'):
                    SandboxController(core, NoEffects()).dispatch('observer-token', None)

    # Red if ordinary validate makes the token optional, or credential setup
    # skips real non-token validation or applies image effects under the lock.
    def test_complete_configuration_bootstrap_and_ordinary_missing_token_denial(self):
        import operator_config as module
        from operator_adapter_test import FixtureConfig
        from operator_config import Configuration
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[3] / 'node_modules') as d:
            root = Path(d); setup(root)
            fixture = FixtureConfig()
            config = Configuration(fixture.core, fixture.data)
            executable, native = root / 'executable', root / 'native'
            executable.write_bytes(b'#!/bin/sh\nexit 1\n'); executable.chmod(0o700)
            native.write_bytes(b'TEST_ONLY_NATIVE_CONFIG')
            config.core['backup_identity'].update(wrapper=str(executable), config_path=str(native))
            config.data.update(wrapper_sha256=sha_bytes(executable.read_bytes()),
                               backup_config_sha256=sha_bytes(native.read_bytes()))
            service, password, token = (root / name for name in ('service', 'password', 'token'))
            service.write_bytes(b'[observer]\nhost=/var/run/postgresql\nport=5432\n'
                b'dbname=fixture_db\nuser=fixture_observer\nconnect_timeout=5\n')
            password.write_bytes(b'TEST_ONLY_LIBPQ_INPUT')
            service.chmod(0o600); password.chmod(0o600)
            ghdir, includedir = root / 'github-empty', root / 'include-empty'
            ghdir.mkdir(); includedir.mkdir()
            core = json.loads((root / 'config.json').read_bytes())
            class SandboxController(Controller):
                def identity(self): return MACHINE
            with patch.object(module, 'EXECUTABLES', {k: str(executable) for k in EXECUTABLES}), \
                 patch.object(module, 'SERVICE', str(service)), patch.object(module, 'PASS', str(password)), \
                 patch.object(module, 'TOKEN', str(token)), patch.object(module, 'GH_DIR', str(ghdir)), \
                 patch.object(module, 'INCLUDE_DIR', str(includedir)), \
                 patch.object(observer_token, 'TOKEN', str(token)), \
                 patch.object(observer_token, 'load_installation', return_value=config):
                with self.assertRaises(FileNotFoundError): config.validate()
                reader, writer = os.pipe()
                os.write(writer, TOKEN); os.close(writer)
                with os.fdopen(reader, 'rb', buffering=0) as stream:
                    result = SandboxController(core, NoEffects()).dispatch('observer-token', stream)
                self.assertEqual(result, {'observer_token': 'configured'})
                config.validate()
                self.assertEqual(token.read_bytes(), TOKEN)
                token.unlink()
                with self.assertRaises(FileNotFoundError): config.validate()
                service.write_bytes(service.read_bytes() + b'options=UNTRUSTED_TEST_OPTION\n')
                reader, writer = os.pipe(); os.close(writer)
                with os.fdopen(reader, 'rb', buffering=0) as stream:
                    with self.assertRaises(Denied):
                        SandboxController(core, NoEffects()).dispatch('observer-token', stream)
                self.assertFalse(token.exists())


if __name__ == '__main__':
    unittest.main()
