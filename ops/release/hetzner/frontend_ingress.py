"""Stage an exact independently observed GitHub frontend ZIP; never activate it."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import stat
import struct
import tempfile
import zipfile
import zlib

from contract import Denied, require
from frontend_bundle import MAX_ARCHIVE, stage_frontend_bundle

MAX_ZIP = 300_000_000
MAX_MANIFEST = 65536
MAX_CENTRAL = 65536
FILES = {'frontend-release.tgz': MAX_ARCHIVE, 'frontend-manifest.json': MAX_MANIFEST}


def _authority(value):
    fields = {'sha', 'ci_run_id', 'ci_run_attempt', 'artifact_id', 'artifact_name',
              'artifact_sha256', 'artifact_bytes'}
    require(isinstance(value, dict) and set(value) == fields, 'frontend-authority')
    require(isinstance(value['sha'], str) and re.fullmatch(r'[0-9a-f]{40}', value['sha']),
            'frontend-authority')
    for key in ('ci_run_id', 'ci_run_attempt', 'artifact_id'):
        require(isinstance(value[key], str) and re.fullmatch(r'[1-9][0-9]{0,14}', value[key]),
                'frontend-authority')
    require(value['artifact_name'] == 'frontend-candidate-{sha}-{ci_run_id}-{ci_run_attempt}'.format(**value)
            and isinstance(value['artifact_sha256'], str)
            and re.fullmatch(r'sha256:[0-9a-f]{64}', value['artifact_sha256'])
            and type(value['artifact_bytes']) is int and 0 < value['artifact_bytes'] <= MAX_ZIP,
            'frontend-authority')
    return dict(value)


def _identity(value):
    return tuple(getattr(value, key) for key in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns',
                 'st_ctime_ns', 'st_nlink', 'st_mode', 'st_uid', 'st_gid'))


def _directory_bounds(source, size):
    """Bound the central directory before zipfile allocates any entry objects."""
    source.seek(max(0, size - 65557))
    tail = source.read(65557)
    offset = tail.rfind(b'PK\x05\x06')
    require(offset >= 0 and len(tail) - offset >= 22, 'frontend-zip-directory')
    _, disk, start_disk, disk_count, count, length, start, comment = struct.unpack(
        '<4s4H2IH', tail[offset:offset + 22])
    require(offset + 22 + comment == len(tail) and disk == start_disk == 0,
            'frontend-zip-directory')
    end = max(0, size - 65557) + offset
    zip64 = offset >= 20 and tail[offset - 20:offset - 16] == b'PK\x06\x07'
    if zip64 or count == 65535 or disk_count == 65535 or length == 0xffffffff or start == 0xffffffff:
        require(end >= 20, 'frontend-zip-directory')
        source.seek(end - 20)
        marker, disk, record, disks = struct.unpack('<4sIQI', source.read(20))
        require(marker == b'PK\x06\x07' and disk == 0 and disks == 1 and 0 <= record <= end - 76,
                'frontend-zip-directory')
        source.seek(record)
        raw = source.read(56)
        require(len(raw) == 56, 'frontend-zip-directory')
        marker, extra, _, _, disk, start_disk, disk_count, count, length, start = struct.unpack('<4sQ2H2I4Q', raw)
        require(marker == b'PK\x06\x06' and extra == 44 and disk == start_disk == 0
                and record + 56 == end - 20, 'frontend-zip-directory')
        end = record
    require(count == disk_count == 2 and 0 < length <= MAX_CENTRAL and start + length == end,
            'frontend-zip-directory')
    source.seek(0)


def _extract(source, destination):
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        require(len(entries) == 2 and {entry.filename for entry in entries} == set(FILES)
                and min(entry.header_offset for entry in entries) == 0
                and len({entry.header_offset for entry in entries}) == 2, 'frontend-zip-members')
        for entry in entries:
            ceiling = FILES[entry.filename]
            require(entry.orig_filename == entry.filename and not entry.is_dir()
                    and stat.S_IFMT(entry.external_attr >> 16) in (0, stat.S_IFREG)
                    and not entry.flag_bits & 1 and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    and 0 < entry.file_size <= ceiling and 0 <= entry.compress_size <= MAX_ZIP,
                    'frontend-zip-member')
            with archive.open(entry) as incoming, (destination / entry.filename).open('xb') as output:
                observed = 0
                while chunk := incoming.read(65536):
                    observed += len(chunk)
                    require(observed <= entry.file_size and observed <= ceiling, 'frontend-zip-member-size')
                    output.write(chunk)
                require(observed == entry.file_size, 'frontend-zip-member-size')
                output.flush()
                os.fsync(output.fileno())


def _pairs(values):
    result = {}
    for key, value in values:
        require(key not in result, 'frontend-manifest-json')
        result[key] = value
    return result


def _constant(_value):
    raise Denied('frontend-manifest-json')


def stage_frontend_artifact(zip_path, authority, staging_parent):
    """Caller supplies independent authority, holds its release lock and owns parent custody.

    Returns an unpublished private root containing public/admin and receipt bindings.
    Caller owns durable publication, retention, cleanup and the trusted verifier script.
    No executable verifier, Compose/env input or extra file is accepted from the ZIP.
    """
    authority = _authority(authority)
    parent, path = Path(staging_parent), Path(zip_path)
    staged = None
    try:
        parent_info = parent.lstat()
        require(stat.S_ISDIR(parent_info.st_mode) and parent_info.st_uid == os.geteuid()
                and not parent_info.st_mode & 0o077, 'frontend-staging-parent')
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'rb') as source:
            before = os.fstat(source.fileno())
            require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
                    and before.st_size == authority['artifact_bytes'], 'frontend-zip-file')
            checksum = 'sha256:' + hashlib.file_digest(source, 'sha256').hexdigest()
            require(hmac.compare_digest(checksum, authority['artifact_sha256']), 'frontend-zip-digest')
            _directory_bounds(source, before.st_size)
            with tempfile.TemporaryDirectory(prefix='.frontend-transport-', dir=parent) as temporary:
                extracted = Path(temporary)
                _extract(source, extracted)
                raw = (extracted / 'frontend-manifest.json').read_bytes()
                manifest = json.loads(raw.decode('utf-8'), object_pairs_hook=_pairs, parse_constant=_constant)
                staged = stage_frontend_bundle(extracted / 'frontend-release.tgz', manifest,
                    authority['sha'], authority['ci_run_id'], authority['ci_run_attempt'], parent)
                require(_identity(before) == _identity(os.fstat(source.fileno())) == _identity(path.lstat()),
                        'frontend-zip-changed')
                return {'root': str(staged), 'authority': authority,
                    'manifest_sha256': 'sha256:' + hashlib.sha256(raw).hexdigest(),
                    'archive_sha256': 'sha256:' + manifest['archive']['sha256'],
                    'archive_bytes': manifest['archive']['bytes']}
    except Exception as error:
        if staged is not None:
            shutil.rmtree(staged)
        if isinstance(error, (OSError, ValueError, zipfile.BadZipFile, RuntimeError, UnicodeError,
                              RecursionError, struct.error, zlib.error)):
            raise Denied('frontend-transport-invalid') from error
        raise
