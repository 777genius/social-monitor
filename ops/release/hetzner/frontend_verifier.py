"""Generate trusted startup checks from an already verified frontend tree."""
import hashlib
import os
from pathlib import Path
import re
import shlex
import stat
import tempfile

from contract import DIGEST, require, sync_dir, trusted
from frontend_bundle import MAX_CONTENT, MAX_FILE, MAX_MEMBERS
from frontend_tree import _entries, _identity, tree_digest

MAX_SCRIPT = 8 * 1024**2
PREFIX = '/usr/share/nginx/'


def _records(root):
    records, total = [], 0
    for name, identity in _entries(root):
        require(name.split('/')[0] in ('public', 'admin'), 'frontend-verifier-path')
        path = root / name
        record = {'name': name, 'mode': stat.S_IMODE(identity[2]), 'directory': stat.S_ISDIR(identity[2])}
        if not record['directory']:
            size = identity[4]
            total += size
            require(size <= MAX_FILE and total <= MAX_CONTENT, 'frontend-verifier-size')
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, 'rb') as source:
                require(_identity(os.fstat(fd)) == identity, 'frontend-verifier-changed')
                checksum, remaining = hashlib.sha256(), size
                while remaining:
                    chunk = source.read(min(remaining, 1024**2))
                    require(chunk, 'frontend-verifier-changed')
                    checksum.update(chunk); remaining -= len(chunk)
                require(not source.read(1) and _identity(os.fstat(fd)) == identity
                        and _identity(path.lstat()) == identity, 'frontend-verifier-changed')
            record.update(size=size, sha256=checksum.hexdigest())
        records.append(record)
    require(2 <= len(records) <= MAX_MEMBERS, 'frontend-verifier-count')
    return records


def _script(records, expected):
    # No artifact content is executable. Every name is a quoted argument; find's
    # NUL output is counted in bytes, so newlines/spaces cannot forge the count.
    lines = ['#!/bin/sh', 'set -eu', 'set -o pipefail', 'export LC_ALL=C',
             'export PATH=/usr/sbin:/usr/bin:/sbin:/bin', 'umask 077',
             "fail() { printf '%s\\n' 'frontend-verifier-denied' >&2; exit 1; }",
             'dir_check() {', '  [ ! -L "$1" ] && [ -d "$1" ] || fail',
             '  [ "$(stat -c %a -- "$1" 2>/dev/null)" = "$2" ] || fail', '}',
             'file_check() {', '  [ ! -L "$1" ] && [ -f "$1" ] && [ -r "$1" ] || fail',
             '  [ "$(stat -c %a:%s:%h -- "$1" 2>/dev/null)" = "$2:$3:1" ] || fail',
             '  actual=$(head -c "$(( $3 + 1 ))" -- "$1" | sha256sum) 2>/dev/null || fail',
             '  [ "${actual%% *}" = "$4" ] || fail',
             '  [ "$(stat -c %a:%s:%h -- "$1" 2>/dev/null)" = "$2:$3:1" ] || fail', '}',
             '# Archive-derived tree seal: ' + expected]
    for record in sorted(records, key=lambda item: (not item['directory'], item['name'])):
        args = [PREFIX + record['name'], format(record['mode'], 'o')]
        if not record['directory']:
            args.extend((str(record['size']), record['sha256']))
        lines.append(('dir_check ' if record['directory'] else 'file_check ')
                     + ' '.join(shlex.quote(value) for value in args))
    path_bytes = sum(len((PREFIX + record['name']).encode('utf-8')) + 1 for record in records)
    roots = ' '.join(shlex.quote(PREFIX + lane) for lane in ('public', 'admin'))
    lines.extend([f'count=$(find {roots} -print0 '
                  f'| head -c {path_bytes + 1} | wc -c) 2>/dev/null || fail',
                  f'[ "$count" -eq {path_bytes} ] || fail', 'exit 0', ''])
    data = '\n'.join(lines).encode('utf-8')
    require(len(data) <= MAX_SCRIPT, 'frontend-verifier-size')
    return data


def _existing(path, expected):
    trusted(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o555
                and before.st_size == len(expected), 'frontend-verifier-conflict')
        require(source.read(MAX_SCRIPT + 1) == expected
                and _identity(before) == _identity(os.fstat(fd)) == _identity(path.lstat()),
                'frontend-verifier-conflict')


def write_frontend_verifier(root, expected_tree_sha256, target):
    """Caller holds the release lock and owns root/target-parent custody.

    The root contains only public/admin. Target lives outside root. Production
    requires UID0; the generated script requires BusyBox sh with pipefail, stat,
    head, find -print0, wc and sha256sum. It never starts an application.
    """
    require(os.geteuid() == 0, 'frontend-verifier-root')
    require(isinstance(expected_tree_sha256, str) and re.fullmatch(DIGEST, expected_tree_sha256),
            'frontend-verifier-digest')
    root = trusted(root, directory=True)
    require(isinstance(target, (str, Path)) and str(Path(target)) == str(target), 'frontend-verifier-target')
    target = Path(target)
    require(target.is_absolute() and str(target) == os.path.normpath(str(target))
            and '..' not in target.parts and root not in target.parents, 'frontend-verifier-target')
    trusted(target.parent, directory=True)
    require(tree_digest(root) == expected_tree_sha256, 'frontend-verifier-tree')
    data = _script(_records(root), expected_tree_sha256)
    require(tree_digest(root) == expected_tree_sha256, 'frontend-verifier-tree')
    fd, name = tempfile.mkstemp(prefix='.verifier-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data); os.fchmod(output.fileno(), 0o555)
            output.flush(); os.fsync(output.fileno())
        require(tree_digest(root) == expected_tree_sha256, 'frontend-verifier-tree')
        try:
            os.link(name, target)
        except FileExistsError:
            _existing(target, data)
        sync_dir(target.parent)
        _existing(target, data)
        require(tree_digest(root) == expected_tree_sha256, 'frontend-verifier-tree')
        return {'path': str(target), 'sha256': 'sha256:' + hashlib.sha256(data).hexdigest()}
    finally:
        os.unlink(name)
