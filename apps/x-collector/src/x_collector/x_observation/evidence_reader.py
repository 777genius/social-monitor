"""Fixed trusted evidence view. Only TS writes; Python never locks or repairs files."""
import os
from pathlib import Path
import stat

from .bounded_json import parse_json
from .failures import ObservationFailure


class EvidenceReader:
    def __init__(self, root, owner_uid, filenames, *, immutable=False):
        # Layout names come from parent composition, NOT a command/grant/RPC field.
        self.root = Path(root)
        self.owner_uid = owner_uid
        self.names = dict(filenames)
        self.immutable = immutable
        self._seen = {}
        if any(Path(name).name != name or name in {'', '.', '..'} for name in self.names.values()):
            raise ObservationFailure('INVALID_GRANT')
        self._fd = None
        try:
            # Open each directory component without following links.
            current = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
            try:
                for part in self.root.absolute().parts[1:]:
                    following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
                    if self.immutable:
                        info = os.fstat(following)
                        mode = stat.S_IMODE(info.st_mode)
                        sticky_root = info.st_uid == 0 and mode & 0o1000 and mode & 0o002
                        if info.st_uid not in {0, self.owner_uid} or (mode & 0o022 and not sticky_root):
                            os.close(following)
                            raise ObservationFailure('INVALID_GRANT')
                    os.close(current)
                    current = following
                self._fd = current
                current = None
            finally:
                if current is not None:
                    os.close(current)
            self._identity = self._directory_identity(os.fstat(self._fd))
        except (OSError, ObservationFailure):
            self.close()
            raise ObservationFailure('INVALID_GRANT') from None

    def _directory_identity(self, info):
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != self.owner_uid or info.st_mode & 0o077 or (self.immutable and stat.S_IMODE(info.st_mode) != 0o700):
            raise ObservationFailure('INVALID_GRANT')
        return info.st_dev, info.st_ino

    def read(self, record_key):
        return parse_json(self.read_bytes(record_key), max_bytes=16 * 1024 * 1024, max_nodes=1000000)

    def read_bytes(self, record_key):
        try:
            if self._fd is None or record_key not in self.names:
                raise ObservationFailure('INVALID_GRANT')
            # Reopening validates ancestor symlinks/replacement, not only the leaf.
            with EvidenceReader(self.root, self.owner_uid, {}, immutable=self.immutable) as current:
                if current._identity != self._identity:
                    raise ObservationFailure('JOURNAL_FAILURE')
            descriptor = os.open(self.names[record_key], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                 dir_fd=self._fd)
            try:
                before = os.fstat(descriptor)
                if (not stat.S_ISREG(before.st_mode) or before.st_uid != self.owner_uid
                        or before.st_mode & 0o077 or before.st_nlink != 1
                        or (self.immutable and stat.S_IMODE(before.st_mode) != 0o400)
                        or not 0 <= before.st_size <= 16 * 1024 * 1024):
                    raise ObservationFailure('JOURNAL_FAILURE')
                content = bytearray()
                while len(content) <= before.st_size:
                    chunk = os.read(descriptor, min(65536, before.st_size + 1 - len(content)))
                    if not chunk:
                        break
                    content.extend(chunk)
                after = os.fstat(descriptor)
                linked = os.stat(self.names[record_key], dir_fd=self._fd, follow_symlinks=False)
                identity = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
                if identity(before) != identity(after) or identity(before) != identity(linked) or len(content) != before.st_size:
                    raise ObservationFailure('JOURNAL_FAILURE')
                stamp = identity(before)
                if self.immutable and self._seen.get(record_key, stamp) != stamp:
                    raise ObservationFailure('JOURNAL_FAILURE')
                self._seen[record_key] = stamp
                return bytes(content)
            finally:
                os.close(descriptor)
        except OSError:
            raise ObservationFailure('JOURNAL_FAILURE') from None

    def close(self):
        if self._fd is not None:
            os.close(self._fd)
            self._fd = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
