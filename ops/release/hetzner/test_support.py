"""Synthetic docker-save fixture and isolated controller subprocess runner."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
from contract import MACHINE

HERE = Path(__file__).parent
SHA = 'a' * 40
RUN = '123'
PREVIOUS = 'sha256:' + 'b' * 64
MIGRATION = '20261001000000_initial'


def archive(root, tags=None, labels=None, link=False, whiteout=False):
    def add(tar, name, data):
        member = tarfile.TarInfo(name)
        member.size = len(data)
        tar.addfile(member, io.BytesIO(data))
    layer = io.BytesIO()
    with tarfile.open(fileobj=layer, mode='w') as tar:
        add(tar, 'app/prisma/migrations/' + MIGRATION + '/migration.sql', b'SELECT 1;')
        if link:
            item = tarfile.TarInfo('app/prisma/migrations/link')
            item.type = tarfile.SYMTYPE
            item.linkname = '/outside'
            tar.addfile(item)
    layer_data = layer.getvalue()
    layers = [layer_data]
    if whiteout:
        removed = io.BytesIO()
        with tarfile.open(fileobj=removed, mode='w') as tar:
            add(tar, '.wh..wh..opq', b'')
        layers.append(removed.getvalue())
    config = json.dumps({'rootfs': {'diff_ids': ['sha256:' + hashlib.sha256(v).hexdigest() for v in layers]},
                         'config': {'Labels': labels or {
                             'org.opencontainers.image.revision': SHA,
                             'social-monitor.ci-run-id': RUN}}}).encode()
    image = 'sha256:' + hashlib.sha256(config).hexdigest()
    path = root / 'candidate.tar'
    with tarfile.open(path, 'w') as tar:
        add(tar, image[7:] + '.json', config)
        for index, data in enumerate(layers):
            add(tar, f'layer{index}.tar', data)
        add(tar, 'manifest.json', json.dumps([{'Config': image[7:] + '.json',
                                               'RepoTags': tags, 'Layers': [f'layer{i}.tar' for i in range(len(layers))]}]).encode())
    return path, image, 'sha256:' + hashlib.sha256(path.read_bytes()).hexdigest()


def layered_archive(root, layers, modern=False, root_media=None, root_annotations=None, gzip_transform=None):
    import gzip
    from archive import CONFIG, MANIFEST, LAYER
    def digest_bytes(data):
        return 'sha256:' + hashlib.sha256(data).hexdigest()
    def add(tar, name, data):
        item = tarfile.TarInfo(name)
        item.size = len(data)
        tar.addfile(item, io.BytesIO(data))
    config = json.dumps({'os': 'linux', 'architecture': 'amd64',
        'rootfs': {'diff_ids': [digest_bytes(data) for data in layers]},
        'config': {'Labels': {'org.opencontainers.image.revision': SHA,
                             'social-monitor.ci-run-id': RUN}}}).encode()
    config_id = digest_bytes(config)
    path = root / 'candidate.tar'
    descriptor = None
    with tarfile.open(path, 'w') as tar:
        if modern:
            for name in ('blobs', 'blobs/sha256'):
                item = tarfile.TarInfo(name)
                item.type = tarfile.DIRTYPE
                tar.addfile(item)
            def blob(data, media):
                ident = digest_bytes(data)
                add(tar, 'blobs/sha256/' + ident[7:], data)
                return {'mediaType': media, 'digest': ident, 'size': len(data)}
            config_desc = blob(config, CONFIG)
            layer_descs = [blob((gzip_transform or (lambda v: v))(gzip.compress(data, mtime=0)),
                               LAYER + '+gzip') for data in layers]
            manifest = json.dumps({'schemaVersion': 2, 'mediaType': MANIFEST,
                                  'config': config_desc, 'layers': layer_descs}).encode()
            descriptor = blob(manifest, MANIFEST)
            image = descriptor['digest']
            index_desc = {**descriptor, 'mediaType': root_media or MANIFEST,
                          'annotations': {'config.digest': config_id, **(root_annotations or {})}}
            add(tar, 'index.json', json.dumps({'schemaVersion': 2, 'manifests': [index_desc]}).encode())
            add(tar, 'oci-layout', b'{"imageLayoutVersion":"1.0.0"}')
            config_name = 'blobs/sha256/' + config_id[7:]
            names = ['blobs/sha256/' + d['digest'][7:] for d in layer_descs]
        else:
            image, config_name = config_id, config_id[7:] + '.json'
            add(tar, config_name, config)
            names = [f'layer{i}.tar' for i in range(len(layers))]
            for name, data in zip(names, layers):
                add(tar, name, data)
        add(tar, 'manifest.json', json.dumps([{'Config': config_name, 'RepoTags': None, 'Layers': names}]).encode())
    return (path, image, digest_bytes(path.read_bytes())), descriptor


def layer(entries):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w') as tar:
        for name, content in entries:
            item = tarfile.TarInfo(name)
            if content is None:
                item.type = tarfile.DIRTYPE
                tar.addfile(item)
            else:
                item.size = len(content)
                tar.addfile(item, io.BytesIO(content))
    return data.getvalue()


def setup(root):
    state = root / 'state'
    for folder in ('inbox', 'admissions', 'receipts', 'transactions', 'overrides', 'imports'):
        (state / folder).mkdir(parents=True, exist_ok=True)
    (state / 'controller.lock').touch()
    config = {'state': str(state), 'inbox': str(state / 'inbox'), 'adapter': '/operator-adapter',
              'project': 'sandbox-release', 'project_directory': str(root),
              'compose_files': [str(root / 'trusted-compose.json')],
              'env_files': [str(root / 'metadata-only.env')],
              'required_non_targets': {n: n for n in ('jev-agent-runtime', 'jev-intelligence-worker', 'social-x-collector')},
              'fenced_units': ['synthetic-writer.timer'], 'migration_root': '/app/prisma/migrations',
              'max_archive_bytes': 10000000, 'backup_max_age_seconds': 3600,
              'evidence_max_age_seconds': 60, 'probe_attempts': 1, 'probe_interval_seconds': 1}
    config['backup_identity'] = {'wrapper': '/usr/local/sbin/pgbackrest-with-cipher-pass',
        'config_path': str(root / 'backup.conf'), 'stanza': 'sandbox-main', 'repository': '1',
        'repository_id': 'sandbox-repo', 'system_identifier': '1111111111111111111'}
    for path in (*config['compose_files'], *config['env_files'], config['backup_identity']['config_path']):
        Path(path).write_text('synthetic-config=one\n')
    service_env = root / 'service.env'
    service_env.write_text('SYNTHETIC_API_MODE=one\n')
    (root / 'config.json').write_text(json.dumps(config))
    containers = {name: {'id': name, 'name': '/' + name, 'image': PREVIOUS,
                         'started': 'before', 'running': True, 'service': name,
                         'project': 'sandbox-release'} for name in config['required_non_targets']}
    fake = {'identity': MACHINE, 'sha': SHA, 'run': RUN, 'previous': PREVIOUS,
            'previous_sha': 'c' * 40, 'containers': containers,
            'target': {'id': 'api', 'name': '/api', 'image': PREVIOUS, 'started': 'before',
                       'running': True, 'service': 'api', 'project': 'sandbox-release'},
            'model': {'services': {'api': {'image': 'shared:mutable',
                                          'env_file': [{'path': str(service_env), 'required': True}],
                                          'volumes': ['/host/secret:/run/secret:ro']},
                                   'jev-agent-runtime': {'image': 'shared:mutable'}}}}
    (root / 'fake.json').write_text(json.dumps(fake))
    Path(config['compose_files'][0]).write_text(json.dumps(fake['model']))
    return config


def mutate(root, **values):
    path = root / 'fake.json'
    state = json.loads(path.read_text())
    state.update(values)
    path.write_text(json.dumps(state))


def run(root, command, data=b''):
    return subprocess.run([sys.executable, '-B', str(HERE / 'test_support.py'), str(root), command],
                          input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)


def receive(root, image_archive=None):
    path, image, checksum = image_archive or archive(root)
    result = run(root, f'receive {SHA} {RUN} {checksum} {image} {path.stat().st_size}', path.read_bytes())
    return result, image


if __name__ == '__main__':
    from controller import Controller
    from host import Host
    from contract import Denied, canonical
    root = Path(sys.argv[1])
    config = json.loads((root / 'config.json').read_text())

    class FakeHost(Host):
        def private_digest(self, path):
            # Synthetic fixtures relax only the temporary ancestor ownership gate.
            # Production hashing, regular-file/symlink/size/change checks still execute.
            from unittest.mock import patch
            import contract
            import stat
            def fixture_trust(value):
                path = Path(value)
                info = path.lstat()
                contract.require(path.is_absolute() and not stat.S_ISLNK(info.st_mode)
                    and not info.st_mode & 0o022, 'untrusted-installation')
                return path
            with patch('contract.trusted', fixture_trust):
                return super().private_digest(path)

        def command(self, argv, data=None):
            result = subprocess.run([sys.executable, '-B', str(HERE / 'fake_command.py'), str(root), *argv],
                                    input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            if result.returncode:
                raise Denied('fake-command-failed')
            return result.stdout

    class TestController(Controller):
        def finish(self, key, tx, outcome, probes):
            import controller
            original = controller.atomic
            def publication(path, value, immutable=False):
                original(path, value, immutable)
                flags = json.loads((root / 'fake.json').read_text())
                if path.parent.name == 'receipts' and flags.get('crash_receipt'):
                    flags.pop('crash_receipt')
                    (root / 'fake.json').write_text(json.dumps(flags))
                    import os
                    os.kill(os.getpid(), 9)
            controller.atomic = publication
            try:
                return super().finish(key, tx, outcome, probes)
            finally:
                controller.atomic = original

        def identity(self):
            return json.loads((root / 'fake.json').read_text())['identity']

    try:
        result = TestController(config, FakeHost(config)).dispatch(sys.argv[2], sys.stdin.buffer)
        print(canonical(result).decode())
    except Denied as error:
        print(canonical({'denied': str(error)}).decode())
        sys.exit(1)
    except Exception as error:
        print(type(error).__name__, file=sys.stderr)
        sys.exit(2)
