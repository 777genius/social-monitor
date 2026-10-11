"""Verify tag-free classic saves or one linux/amd64 OCI manifest and final SQL bytes."""
import hashlib
import json
from pathlib import PurePosixPath
import re
import tarfile
import tempfile
from pathlib import Path
import stat
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bounds
from bounds import Budget, EXPANSION, MEMBER_BYTES, scan_tar, gzip_chunks
from contract import DIGEST, Denied, canonical, require

OCI = 'application/vnd.oci.image.'
MANIFEST = OCI + 'manifest.v1+json'
CONFIG = OCI + 'config.v1+json'
LAYER = OCI + 'layer.v1.tar'


def safe_name(name):
    path = PurePosixPath(name)
    require(len(name) <= 4096 and not path.is_absolute() and '..' not in path.parts, 'archive-path')
    return str(path)


def json_member(tar, member, limit=4_000_000):
    require(member.isfile() and member.size <= limit, 'archive-json-size')
    return json.load(tar.extractfile(member))


def hash_stream(stream, budget=None):
    result = hashlib.sha256()
    while True:
        chunk = stream.read(1024 * 1024)
        if budget:
            budget.check()
        if not chunk:
            return 'sha256:' + result.hexdigest()
        result.update(chunk)


def blob(tar, members, descriptor, media, budget):
    checksum = descriptor.get('digest', '')
    require(re.fullmatch(DIGEST, checksum) and descriptor.get('mediaType') in media,
            'oci-descriptor')
    name = 'blobs/sha256/' + checksum[7:]
    require(name in members and members[name].isfile()
            and type(descriptor.get('size')) is int
            and descriptor['size'] == members[name].size, 'oci-blob-size')
    require(hash_stream(tar.extractfile(members[name]), budget) == checksum, 'oci-blob-digest')
    return name


def migration_layer(tar, members, name, diff, compressed, files, root, budget):
    # Bounded decompression into private temporary storage, never Docker/extracted paths.
    raw = tar.extractfile(members[name])
    source = gzip_chunks(raw, budget) if compressed else iter(lambda: raw.read(65536), b'')
    with tempfile.TemporaryFile(dir=tar.name and str(PurePosixPath(tar.name).parent)) as layer:
        total, checksum = 0, hashlib.sha256()
        for chunk in source:
            total += len(chunk)
            budget.check(len(chunk))
            require(total <= MEMBER_BYTES and (not compressed or
                    total <= max(65536, members[name].size * EXPANSION)), 'layer-expansion-limit')
            checksum.update(chunk)
            layer.write(chunk)
        require('sha256:' + checksum.hexdigest() == diff, 'layer-digest')
        scan_tar(layer, budget)
        with tarfile.open(fileobj=layer, mode='r:') as inner:
            # OCI deletions act on the lower layer, regardless of header ordering.
            items = inner.getmembers()
            require(all(item.sparse is None and 0 <= item.size <= MEMBER_BYTES for item in items),
                    'archive-logical-member-size')
            lower = dict(files)
            def remove(path):
                for key in list(lower):
                    if key == path or key.startswith(path + '/'):
                        del lower[key]
            for item in items:
                budget.check()
                path = safe_name(item.name)
                parent, _, leaf = path.rpartition('/')
                if leaf == '.wh..wh..opq':
                    for key in list(lower):
                        if not parent or key.startswith(parent + '/'):
                            del lower[key]
                elif leaf.startswith('.wh.'):
                    remove((parent + '/' if parent else '') + leaf[4:])
            files.clear()
            files.update(lower)
            for item in items:
                path = safe_name(item.name)
                if path.rsplit('/', 1)[-1].startswith('.wh.'):
                    require(item.isfile() and item.size == 0, 'migration-whiteout')
                    continue
                if path == root or path.startswith(root + '/') or root.startswith(path + '/'):
                    require(item.isfile() or item.isdir(), 'migration-link-forbidden')
                    # An ancestor replaced by a file masks the entire migration subtree.
                    if not item.isdir():
                        for key in list(files):
                            if key == path or key.startswith(path + '/'):
                                del files[key]
                    elif files.get(path, ('dir',))[0] != 'dir':
                        files.pop(path, None)
                    for ancestor in PurePosixPath(path).parents:
                        if str(ancestor) != '.':
                            require(files.get(str(ancestor), ('dir',))[0] == 'dir', 'migration-type')
                    files[path] = ('dir', None) if item.isdir() else (
                        'file', hash_stream(inner.extractfile(item), budget)[7:])


def _inspect_archive(path, archive_digest, image_id, sha, ci_run, migration_root):
    budget = Budget()
    with path.open('rb') as stream:
        require(hash_stream(stream, budget) == archive_digest, 'archive-digest')
        scan_tar(stream, budget)
    with tarfile.open(path, mode='r:') as tar:
        members = {}
        for member in tar:
            name = safe_name(member.name)
            require(len(members) < 10000, 'archive-member-count')
            require(name not in members and (member.isfile() or member.isdir()), 'archive-member')
            require(member.sparse is None, 'archive-sparse')
            require(0 <= member.size <= MEMBER_BYTES, 'archive-logical-member-size')
            members[name] = member
        require('manifest.json' in members, 'archive-manifest')
        saves = json_member(tar, members['manifest.json'])
        require(isinstance(saves, list) and len(saves) == 1, 'archive-image-count')
        save = saves[0]
        require(save.get('RepoTags') in (None, []), 'archive-tags-forbidden')
        config_name, layers = safe_name(save['Config']), save['Layers']
        require(config_name in members and isinstance(layers, list)
                and 0 < len(layers) <= 128, 'archive-layers')
        graph = {'kind': 'classic-config', 'root_digest': image_id,
                 'config_digest': image_id}
        allowed = {'manifest.json', config_name, *layers}
        compressed = [False] * len(layers)
        if 'index.json' in members:
            require(json_member(tar, members['oci-layout']) == {'imageLayoutVersion': '1.0.0'}, 'oci-layout')
            index = json_member(tar, members['index.json'])
            descriptors = index.get('manifests', [])
            require(index.get('schemaVersion') == 2 and len(descriptors) == 1, 'oci-single-manifest')
            desc = descriptors[0]
            require(desc.get('mediaType') == MANIFEST, 'candidate-index-unsupported')
            require(desc.get('annotations', {}).get('vnd.docker.reference.type') != 'attestation-manifest',
                    'candidate-attestation-unsupported')
            require(desc.get('digest') == image_id, 'oci-root-identity')
            require(not desc.get('annotations', {}).get('org.opencontainers.image.ref.name'), 'archive-tags-forbidden')
            platform = desc.get('platform')
            require(platform is None or platform == {'os': 'linux', 'architecture': 'amd64'}, 'oci-platform')
            manifest_name = blob(tar, members, desc, {MANIFEST}, budget)
            manifest = json_member(tar, members[manifest_name])
            require(manifest.get('schemaVersion') == 2 and manifest.get('mediaType') == MANIFEST,
                    'oci-manifest')
            require('subject' not in manifest and 'artifactType' not in manifest, 'candidate-attestation-unsupported')
            config_desc, layer_descs = manifest['config'], manifest['layers']
            require(desc.get('annotations', {}).get('config.digest', config_desc['digest']) == config_desc['digest'], 'oci-config-annotation')
            require(blob(tar, members, config_desc, {CONFIG}, budget) == config_name, 'oci-config-binding')
            require(isinstance(layer_descs, list) and len(layer_descs) == len(layers), 'oci-layer-binding')
            for i, descriptor in enumerate(layer_descs):
                require(blob(tar, members, descriptor, {LAYER, LAYER + '+gzip'}, budget) == layers[i], 'oci-layer-binding')
                compressed[i] = descriptor['mediaType'].endswith('+gzip')
            graph = {'kind': 'oci-manifest', 'root_digest': image_id, 'descriptor': desc,
                     'config_digest': config_desc['digest'], 'config': config_desc, 'layers': layer_descs}
            allowed |= {'index.json', 'oci-layout', manifest_name, 'blobs', 'blobs/sha256'}
        else:
            require(hash_stream(tar.extractfile(members[config_name]), budget) == image_id, 'image-config-digest')
        require(set(members) <= allowed, 'archive-extra-members')
        config = json_member(tar, members[config_name])
        if graph['kind'] == 'oci-manifest':
            require(config.get('os') == 'linux' and config.get('architecture') == 'amd64', 'oci-platform')
        labels = config.get('config', {}).get('Labels', {})
        require(labels.get('org.opencontainers.image.revision') == sha
                and labels.get('social-monitor.ci-run-id') == ci_run, 'image-labels')
        diffs = config.get('rootfs', {}).get('diff_ids', [])
        require(len(diffs) == len(layers) and all(re.fullmatch(DIGEST, d) for d in diffs), 'archive-layers')
        graph['diff_ids'] = diffs
        if graph['kind'] == 'classic-config':
            graph['layers'] = [{'digest': d, 'mediaType': LAYER, 'size': members[n].size}
                               for n, d in zip(layers, diffs)]
        files, root = {}, migration_root.strip('/')
        for name, diff, zipped in zip(layers, diffs, compressed):
            migration_layer(tar, members, name, diff, zipped, files, root, budget)
        migrations = []
        for name, (kind, checksum) in sorted(files.items()):
            if not name.startswith(root + '/'):
                continue
            relative = name[len(root) + 1:]
            if kind == 'dir':
                require('/' not in relative and re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', relative), 'migration-layout')
            elif relative != 'migration_lock.toml':
                parts = relative.split('/')
                require(len(parts) == 2 and parts[1] == 'migration.sql'
                        and re.fullmatch(r'[0-9]{14}_[a-z0-9_]+', parts[0]), 'migration-layout')
                migrations.append({'name': parts[0], 'checksum': checksum})
        require(migrations and all(any(m['name'] == n[len(root)+1:] for m in migrations)
                for n, v in files.items() if n.startswith(root + '/') and v[0] == 'dir'), 'migration-layout')
        return {'migrations': migrations, 'image_graph': graph}


def inspect_archive(path, archive_digest, image_id, sha, ci_run, migration_root):
    # A supervisor deadline covers blocking regular-file I/O, JSON/tar parsers and hashes,
    # as well as gzip. No signal handlers, threads or process-global timers escape this call.
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), 'archive-regular-file')
    try:
        result = subprocess.run([sys.executable, '-I', '-B', str(Path(__file__).resolve()),
            str(path.resolve()), archive_digest, image_id, sha, ci_run, migration_root],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=bounds.PROCESS_SECONDS,
            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}, check=False)
    except subprocess.TimeoutExpired:
        raise Denied('archive-deadline') from None
    answer = json.loads(result.stdout)
    if result.returncode:
        raise Denied(answer['denied'])
    return answer


if __name__ == '__main__':
    # Isolated Python excludes caller import paths; only installed sibling modules are used.
    try:
        answer = _inspect_archive(Path(sys.argv[1]), *sys.argv[2:])
        sys.stdout.buffer.write(canonical(answer))
    except Exception as error:
        reason = str(error) if isinstance(error, Denied) else 'archive-invalid'
        sys.stdout.buffer.write(canonical({'denied': reason}))
        sys.exit(1)
