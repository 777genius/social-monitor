"""Pinned host-only fixture files; finite cleanup never traverses runtime paths."""
import json
import os
from pathlib import Path
import stat
import uuid


LIMIT = 1024 * 1024
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def identity(info):
    return info.st_dev, info.st_ino, info.st_uid, stat.S_IMODE(info.st_mode)


class LocalFiles:
    def __init__(self, path, need):
        self.need = need
        self.path = Path(path)
        self.fd = self.runtime_fd = None
        need(self.path.is_absolute() and '..' not in self.path.parts
             and self.path == self.path.resolve() and str(self.path) == str(path), 'noncanonical-input')
        try:
            self.fd = self.open_directory()
            self.directory_identity = identity(os.fstat(self.fd))
            self.fixture_bytes = self.read(self.path.name, required=True)
            self.runtime_identity = None
            self.runtime_invalid = False
            try:
                self.pin_runtime()
            except (OSError, ValueError):
                self.runtime_invalid = True
            except Exception:
                self.runtime_invalid = True
        except BaseException:
            self.close()
            raise

    def open_directory(self):
        fd = os.open('/', DIRECTORY_FLAGS)
        try:
            parts = self.path.parent.parts[1:]
            for index, part in enumerate(parts):
                child = os.open(part, DIRECTORY_FLAGS, dir_fd=fd)
                os.close(fd)
                fd = child
                info = os.fstat(fd)
                final = index == len(parts) - 1
                self.need(info.st_uid == 0 and (
                    stat.S_IMODE(info.st_mode) == 0o700 if final else
                    not info.st_mode & 0o022 or bool(info.st_mode & stat.S_ISVTX)),
                    'fixture-directory-protection')
            self.need(bool(parts), 'fixture-directory')
            result, fd = fd, None
            return result
        finally:
            if fd is not None:
                os.close(fd)

    def recheck(self):
        try:
            fd = self.open_directory()
        except OSError:
            self.need(False, 'fixture-directory-changed')
        try:
            self.need(identity(os.fstat(fd)) == self.directory_identity
                      == identity(os.fstat(self.fd)), 'fixture-directory-changed')
        finally:
            os.close(fd)
        self.need(self.read(self.path.name, required=True) == self.fixture_bytes,
                  'fixture-protected-binding-changed')

    def read(self, name, required=False):
        try:
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                         dir_fd=self.fd)
        except FileNotFoundError:
            self.need(not required, 'fixture-file-missing')
            return None
        with os.fdopen(fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            self.need(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                      and stat.S_IMODE(before.st_mode) == 0o600
                      and before.st_size <= LIMIT, 'fixture-file-protection')
            data = stream.read(LIMIT + 1)
            after = os.fstat(stream.fileno())
            named = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
            self.need(identity(before) == identity(after) == identity(named)
                      and before.st_size == after.st_size == named.st_size == len(data)
                      and before.st_mtime_ns == after.st_mtime_ns == named.st_mtime_ns
                      and before.st_ctime_ns == after.st_ctime_ns == named.st_ctime_ns
                      and len(data) <= LIMIT, 'fixture-file-changed')
            return data

    def object(self, data):
        value = json.loads(data)
        self.need(isinstance(value, dict), 'json-object-required')
        return value

    def fixture(self):
        return self.object(self.fixture_bytes)

    def state(self):
        data = self.read('.driver.json')
        return None if data is None else self.object(data)

    def write_state(self, value):
        # Even after a namespace replacement, this writes only into the pinned
        # original private directory, never through the replacement pathname.
        self.need(identity(os.fstat(self.fd)) == self.directory_identity,
                  'fixture-directory-changed')
        name = '.driver-pending-' + uuid.uuid4().hex
        data = json.dumps(value, sort_keys=True, separators=(',', ':')).encode() + b'\n'
        self.need(len(data) <= LIMIT, 'fixture-state-size')
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=self.fd)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, '.driver.json', src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd)
        finally:
            try:
                os.unlink(name, dir_fd=self.fd)
            except FileNotFoundError:
                pass

    def pin_runtime(self):
        self.recheck()
        try:
            fd = os.open('runtime', DIRECTORY_FLAGS, dir_fd=self.fd)
        except FileNotFoundError:
            return
        try:
            info = os.fstat(fd)
            self.need(info.st_uid == 0 and stat.S_IMODE(info.st_mode) == 0o700,
                      'runtime-directory-protection')
            if self.runtime_fd is not None:
                self.need(identity(info) == self.runtime_identity, 'runtime-directory-changed')
                return
            self.runtime_identity = identity(info)
            self.runtime_fd, fd = fd, None
        finally:
            if fd is not None:
                os.close(fd)

    def check_runtime(self):
        self.recheck()
        self.need(not self.runtime_invalid, 'runtime-directory-changed')
        try:
            info = os.stat('runtime', dir_fd=self.fd, follow_symlinks=False)
        except FileNotFoundError:
            self.need(self.runtime_fd is None, 'runtime-directory-changed')
            return
        self.need(self.runtime_fd is not None and stat.S_ISDIR(info.st_mode)
                  and identity(info) == self.runtime_identity
                  == identity(os.fstat(self.runtime_fd)), 'runtime-directory-changed')

    def delete_keys(self):
        self.check_runtime()
        groups = [(self.fd, ('id_ed25519', 'id_ed25519.pub'))]
        if self.runtime_fd is not None:
            groups.append((self.runtime_fd, ('ssh_host_ed25519_key',
                                            'ssh_host_ed25519_key.pub')))
        for fd, names in groups:
            for name in names:
                self.check_runtime()
                try:
                    info = os.stat(name, dir_fd=fd, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                self.need(stat.S_ISREG(info.st_mode) and info.st_uid == 0
                          and not info.st_mode & 0o022, 'cleanup-key-protection')
                os.unlink(name, dir_fd=fd)

    def close(self):
        for name in ('runtime_fd', 'fd'):
            fd = getattr(self, name, None)
            if fd is not None:
                os.close(fd)
                setattr(self, name, None)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def __del__(self):
        self.close()
