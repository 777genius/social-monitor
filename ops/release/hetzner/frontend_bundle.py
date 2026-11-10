"""Validate and stage the two CI-built frontend bundles, without activating them."""
import hashlib
import hmac
import gzip
import os
import re
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path

from contract import Denied, require

MAX_ARCHIVE = 256 * 1024 * 1024
MAX_CONTENT = 512 * 1024 * 1024
MAX_FILE = 64 * 1024 * 1024
MAX_MEMBERS = 5000
MAX_TAR = MAX_CONTENT + MAX_MEMBERS * 512 + 1024 * 1024
ORIGINS = {'public': 'https://social-monitor.app', 'admin': 'https://admin.social-monitor.app'}


def validate_manifest(manifest, sha, run, attempt):
    require(isinstance(manifest, dict) and set(manifest) == {
        'version', 'sourceSha', 'ciRunId', 'ciRunAttempt', 'archive', 'bundles'}, 'frontend-manifest')
    require(type(manifest['version']) is int and manifest['version'] == 1
            and all(isinstance(value, str) for value in (sha, run, attempt))
            and re.fullmatch(r'[0-9a-f]{40}', sha)
            and re.fullmatch(r'[1-9][0-9]*', run)
            and re.fullmatch(r'[1-9][0-9]*', attempt)
            and (manifest['sourceSha'], manifest['ciRunId'], manifest['ciRunAttempt']) == (sha, run, attempt),
            'frontend-identity')
    archive = manifest['archive']
    require(isinstance(archive, dict) and set(archive) == {'name', 'sha256', 'bytes'}
            and archive['name'] == 'frontend-release.tgz'
            and isinstance(archive['sha256'], str) and re.fullmatch(r'[0-9a-f]{64}', archive['sha256'])
            and type(archive['bytes']) is int and 0 < archive['bytes'] <= MAX_ARCHIVE, 'frontend-archive')
    bundles = manifest['bundles']
    require(isinstance(bundles, list) and len(bundles) == 2, 'frontend-bundles')
    expected = [{'lane': lane, 'sourceSha': sha, 'ciRunId': run, 'ciRunAttempt': attempt,
                 'apiOrigin': origin} for lane, origin in ORIGINS.items()]
    require(all(bundle in bundles for bundle in expected), 'frontend-bundle-identity')
    return archive


def stage_frontend_bundle(archive_path, manifest, sha, run, attempt, staging_parent):
    """Stage under a caller-verified private parent; caller owns activation and cleanup."""
    archive = validate_manifest(manifest, sha, run, attempt)
    path = Path(archive_path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        raise Denied('frontend-archive-open') from error
    with os.fdopen(fd, 'rb') as source:
        before = os.fstat(source.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size == archive['bytes'],
                'frontend-archive-size')
        checksum = hashlib.file_digest(source, 'sha256').hexdigest()
        require(hmac.compare_digest(checksum, archive['sha256']), 'frontend-archive-digest')
        source.seek(0)
        root = Path(tempfile.mkdtemp(prefix='.frontend-', dir=staging_parent))
        try:
            with _spool(source, root) as safe_tar:
                _extract(safe_tar, root)
            after, named = os.fstat(source.fileno()), os.lstat(path)
            fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_nlink')
            require(all(getattr(before, name) == getattr(after, name) == getattr(named, name)
                        for name in fields), 'frontend-archive-changed')
            _validate_bundle(root, sha)
            return root
        except Exception:
            shutil.rmtree(root)
            raise


def _spool(source, root):
    """Bound decompression and reject extension headers before tarfile parses them."""
    output = tempfile.TemporaryFile(dir=root)
    try:
        with gzip.GzipFile(fileobj=source, mode='rb') as zipped:
            total = 0
            while chunk := zipped.read(1024 * 1024):
                total += len(chunk)
                require(total <= MAX_TAR, 'frontend-tar-size')
                output.write(chunk)
        output.seek(0)
        members = 0
        while header := output.read(512):
            require(len(header) == 512, 'frontend-tar-header')
            if header == bytes(512):
                while remainder := output.read(1024 * 1024):
                    require(not any(remainder), 'frontend-tar-trailing')
                break
            members += 1
            require(members <= MAX_MEMBERS and header[257:263] == b'ustar\0'
                    and header[156:157] in (b'0', b'\0', b'5'), 'frontend-tar-header')
            raw_size = header[124:136].strip(b'\0 ')
            require(not raw_size or re.fullmatch(rb'[0-7]+', raw_size), 'frontend-tar-header')
            size = int(raw_size or b'0', 8)
            require(size <= MAX_FILE and (header[156:157] != b'5' or size == 0), 'frontend-member-size')
            skip = (size + 511) // 512 * 512
            require(output.tell() + skip <= total, 'frontend-tar-truncated')
            output.seek(skip, os.SEEK_CUR)
        require(members > 0, 'frontend-tar-empty')
        output.seek(0)
        return output
    except (OSError, EOFError, gzip.BadGzipFile) as error:
        output.close()
        raise Denied('frontend-archive-invalid') from error
    except Exception:
        output.close()
        raise


def _extract(archive, root):
    seen, total = set(), 0
    try:
        with tarfile.open(fileobj=archive, mode='r:') as bundle:
            for index, member in enumerate(bundle):
                require(index < MAX_MEMBERS, 'frontend-member-count')
                name = member.name.rstrip('/')
                parts = name.split('/')
                require(name and not name.startswith('/') and all(p not in ('', '.', '..') for p in parts)
                        and parts[0] in ORIGINS and len(name) <= 1024, 'frontend-member-path')
                require(name not in seen and (member.isdir() or member.type in (tarfile.REGTYPE, tarfile.AREGTYPE))
                        and member.sparse is None, 'frontend-member-type')
                seen.add(name)
                destination = root.joinpath(*parts)
                if member.isdir():
                    destination.mkdir(mode=0o755, parents=True, exist_ok=True)
                    continue
                require(len(parts) > 1 and 0 <= member.size <= MAX_FILE, 'frontend-member-size')
                total += member.size
                require(total <= MAX_CONTENT, 'frontend-content-size')
                destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                source = bundle.extractfile(member)
                require(source is not None, 'frontend-member-data')
                with destination.open('xb') as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                destination.chmod(0o644)
    except (OSError, tarfile.TarError, EOFError) as error:
        raise Denied('frontend-archive-invalid') from error


def _validate_bundle(root, sha):
    for lane, origin in ORIGINS.items():
        base = root / lane
        try:
            require((base / 'release-sha.txt').read_text() == sha + '\n', 'frontend-release-id')
            require(f'flutter_bootstrap.js?v={sha}' in (base / 'index.html').read_text(), 'frontend-index')
            require(f"const configuredRelease = '{sha}'" in (base / 'flutter_bootstrap.js').read_text(),
                    'frontend-bootstrap')
            require('self.registration.unregister()' in (base / 'flutter_service_worker.js').read_text(),
                    'frontend-service-worker')
            js = (base / 'main.dart.js').read_bytes()
            require(origin.encode() in js and b'nip.io' not in js and (base / 'main.dart.wasm').stat().st_size > 0,
                    'frontend-origin')
            if lane == 'public':
                require(ORIGINS['admin'].encode() not in js, 'frontend-public-admin-origin')
        except (OSError, UnicodeError) as error:
            raise Denied('frontend-bundle-incomplete') from error
