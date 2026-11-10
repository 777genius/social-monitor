"""Bind every frontend file to a bounded, stable content digest."""
import hashlib
import os
from pathlib import Path
import stat
from contract import digest, require
from frontend_bundle import MAX_CONTENT, MAX_FILE, MAX_MEMBERS


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _walk_error(_error):
    require(False, 'frontend-tree-unreadable')


def _entries(root):
    entries = []
    for current, directories, files in os.walk(root, followlinks=False, onerror=_walk_error):
        for name in sorted(directories + files):
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            info = path.lstat()
            require(len(relative) <= 1024 and (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)),
                    'frontend-tree-member')
            if stat.S_ISREG(info.st_mode):
                require(info.st_nlink == 1 and 0 <= info.st_size <= MAX_FILE, 'frontend-tree-file')
            entries.append((relative, _identity(info)))
            require(len(entries) <= MAX_MEMBERS, 'frontend-tree-count')
    return sorted(entries)


def tree_digest_sources(sources):
    """Caller owns two private source directories, which may have unrelated parents."""
    require(isinstance(sources, dict) and set(sources) == {'public', 'admin'}, 'frontend-tree-roots')
    roots = {lane: Path(value) for lane, value in sources.items()}
    initial, root_ids = {}, {}
    for lane, root in roots.items():
        info = root.lstat()
        require(stat.S_ISDIR(info.st_mode), 'frontend-tree-root')
        root_ids[lane] = _identity(info)
        initial[lane] = _entries(root)
    require(sum(len(items) for items in initial.values()) + 2 <= MAX_MEMBERS, 'frontend-tree-count')
    result, total = [], 0
    for lane in sorted(roots):
        root = roots[lane]
        entries = [('', root_ids[lane]), *initial[lane]]
        for path, identity in entries:
            mode, size = identity[2], identity[4]
            label = lane + ('/' + path if path else '')
            require(len(label) <= 1024, 'frontend-tree-member')
            record = {'path': label, 'mode': stat.S_IMODE(mode), 'type': 'directory' if stat.S_ISDIR(mode) else 'file'}
            if stat.S_ISREG(mode):
                total += size
                require(total <= MAX_CONTENT, 'frontend-tree-size')
                descriptor = os.open(root / path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                with os.fdopen(descriptor, 'rb') as source:
                    require(_identity(os.fstat(source.fileno())) == identity, 'frontend-tree-changed')
                    checksum = hashlib.sha256(); remaining = size
                    while remaining:
                        chunk = source.read(min(1024 * 1024, remaining))
                        require(chunk, 'frontend-tree-changed')
                        checksum.update(chunk); remaining -= len(chunk)
                    require(not source.read(1) and _identity(os.fstat(source.fileno())) == identity and
                            _identity((root / path).lstat()) == identity, 'frontend-tree-changed')
                record.update(size=size, sha256=checksum.hexdigest())
            result.append(record)
    for lane, root in roots.items():
        require(_identity(root.lstat()) == root_ids[lane] and _entries(root) == initial[lane], 'frontend-tree-changed')
    return digest(sorted(result, key=lambda item: item['path']))


def tree_digest(root):
    root = Path(root)
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and set(os.listdir(root)) == {'public', 'admin'}, 'frontend-tree-roots')
    result = tree_digest_sources({lane: root / lane for lane in ('public', 'admin')})
    require(_identity(root.lstat()) == _identity(info) and set(os.listdir(root)) == {'public', 'admin'},
            'frontend-tree-changed')
    return result
