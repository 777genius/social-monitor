"""Fixed Docker/systemd operations; operator adapter supplies unknown production probes."""
import json
import subprocess
from contract import DIGEST, SHA, Denied, atomic, digest, fresh, require, private_file_digest
import re
from compose_contract import fixed_roots


class Host:
    def __init__(self, config):
        self.c = config

    def command(self, argv, data=None):
        try:
            result = subprocess.run(argv, input=data, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, timeout=180, check=True,
                                    env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin',
                                         'HOME': '/nonexistent', 'LC_ALL': 'C', 'COMPOSE_DISABLE_ENV_FILE': '1'})
        except (subprocess.SubprocessError, OSError):
            raise Denied('host-command-failed') from None
        return result.stdout

    def docker(self, *args):
        return self.command(['/usr/bin/docker', *args])

    def evidence(self, verb, binding):
        result = json.loads(self.command([self.c['adapter'], verb],
                                        json.dumps(binding).encode()))
        require(isinstance(result, dict) and result.get('version') == 1, 'adapter-version')
        fresh(result.get('observed_at'), self.c['evidence_max_age_seconds'])
        for key, value in binding.items():
            require(result.get(key) == value, 'adapter-binding')
        return result

    def compose(self, override=None):
        args = ['/usr/bin/docker', 'compose', '--project-name', self.c['project'],
                '--project-directory', self.c['project_directory']]
        for path in self.c['env_files']:
            args.extend(['--env-file', path])
        for path in self.c['compose_files']:
            args.extend(['-f', path])
        if override:
            args.extend(['-f', str(override)])
        return args

    def model(self, override=None):
        fixed_roots(self.c['compose_files'], self.private_digest)
        # Metadata only: never resolve env_file contents into the persisted model.
        return json.loads(self.command(self.compose(override) +
                                       ['config', '--no-interpolate', '--no-env-resolution',
                                        '--format', 'json']))

    def private_digest(self, path):
        return private_file_digest(path)

    def compose_fingerprint(self):
        model = self.model()
        paths = set(self.c['compose_files'] + self.c['env_files'])
        for service in model['services'].values():
            for entry in service.get('env_file', []):
                path = entry if isinstance(entry, str) else entry['path']
                require(isinstance(path, str) and '$' not in path, 'compose-env-path')
                paths.add(path)
        for kind in ('secrets', 'configs'):
            for entry in model.get(kind, {}).values():
                if 'file' in entry:
                    paths.add(entry['file'])
        require(len(paths) <= 128, 'compose-input-count')
        return digest({'model': model, 'private_inputs': {
            path: self.private_digest(path) for path in sorted(paths)}})

    def snapshot(self):
        ids = self.docker('ps', '-aq', '--filter',
                          'label=com.docker.compose.project=' + self.c['project']).decode().split()
        # Explicit independently configured names also fence containers outside this project.
        ids.extend(self.c['required_non_targets'].values())
        containers = {}
        target = []
        named = {v: k for k, v in self.c['required_non_targets'].items()}
        require(len(named) == len(self.c['required_non_targets']), 'duplicate-non-target')
        fmt = ('{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},'
               '"started":{{json .State.StartedAt}},"running":{{json .State.Running}},'
               '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
               '"project":{{json (index .Config.Labels "com.docker.compose.project")}}}')
        for ident in sorted(set(ids)):
            item = json.loads(self.docker('inspect', '--format', fmt, ident))
            if ident in named:
                require(item['service'] == named[ident] and item['service'] != 'api',
                        'non-target-selector')
            if item['service'] == 'api' and item['project'] == self.c['project']:
                target.append(item)
            else:
                containers[item['id']] = item
        require(len({v['id'] for v in target}) == 1, 'api-target-count')
        units = {}
        for unit in self.c['fenced_units']:
            raw = self.command(['/usr/bin/systemctl', 'show', unit,
                                '--property=ActiveState,SubState,UnitFileState,ExecMainStartTimestampMonotonic'])
            values = dict(line.split('=', 1) for line in raw.decode().splitlines())
            require(values.get('ActiveState') == 'inactive'
                    and values.get('UnitFileState') in ('disabled', 'masked'), 'writer-not-fenced')
            units[unit] = values
        return {'containers': containers, 'units': units}, target[0]

    def image(self, image_id):
        require(re.fullmatch(DIGEST, image_id), 'image-id')
        raw = self.docker('image', 'inspect', '--format',
                          '{"id":{{json .Id}},"labels":{{json .Config.Labels}},"descriptor":{{json .Descriptor}}}', image_id)
        result = json.loads(raw)
        require(result['id'] == image_id, 'loaded-image-id')
        descriptor = result.get('descriptor')
        if descriptor is not None:
            require(descriptor.get('digest') == image_id and descriptor.get('mediaType') in (
                'application/vnd.oci.image.manifest.v1+json',
                'application/vnd.oci.image.index.v1+json'), 'docker-descriptor')
        return result

    def import_image(self, archive, receipt):
        self.docker('image', 'load', '--input', str(archive))
        result = self.image(receipt['image_id'])
        graph = receipt['image_graph']
        if graph['kind'] == 'oci-manifest':
            descriptor = result.get('descriptor') or {}
            require(all(descriptor.get(k) == graph['descriptor'][k]
                        for k in ('digest', 'size', 'mediaType')), 'loaded-descriptor')
        else:
            require(result.get('descriptor') is None, 'classic-identity-mapping')
        labels = result['labels'] or {}
        require(labels.get('org.opencontainers.image.revision') == receipt['sha']
                and labels.get('social-monitor.ci-run-id') == receipt['ci_run_id'], 'loaded-labels')

    def up(self, image_id, override, expected_fingerprint):
        atomic(override, {'services': {'api': {'image': image_id}}})
        before, after = self.model(), self.model(override)
        require('api' in before['services'], 'api-compose-missing')
        require(after['services']['api']['image'] == image_id, 'api-pin-missing')
        # Removing the single intended image change must reproduce every piece of metadata.
        after['services']['api']['image'] = before['services']['api'].get('image')
        if 'image' not in before['services']['api']:
            del after['services']['api']['image']
        require(after == before, 'compose-scope-changed')
        require(self.compose_fingerprint() == expected_fingerprint, 'trusted-compose-changed')
        self.command(self.compose(override) +
                     ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'])

    def probe(self, image_id, sha):
        try:
            _, before = self.snapshot()
            require(before['running'] is True and before['image'] == image_id, 'probe-target')
            image = self.image(image_id)
            require((image['labels'] or {}).get('org.opencontainers.image.revision') == sha, 'probe-revision')
            result = self.evidence('probe', {'image_id': image_id, 'sha': sha, 'container_id': before['id']})
            _, after = self.snapshot()
            return before == after and result.get('ready') is True \
                and result.get('transport') == 'docker-exec-http' and result.get('http_status') == 200 \
                and result.get('status') == 'ok' and result.get('service') == 'api-gateway' \
                and result.get('postgres_pool_ok') is True
        except (Denied, KeyError, ValueError):
            return False

    def retain(self, image_ids):
        for image_id in image_ids:
            self.docker('image', 'tag', image_id, 'smrel-keep-' + image_id[7:])

    def prune_owned(self, old, keep):
        # Never Docker prune, never remove foreign tags or a container-used image.
        protected = []
        for image_id in sorted(set(old) - set(keep)):
            tag = 'smrel-keep-' + image_id[7:]
            actual = self.docker('image', 'ls', '--no-trunc', '--filter',
                                 'reference=' + tag, '--format', '{{.ID}}').decode().strip()
            if not actual:
                continue  # Reconcile a crash after removing this tag but before updating ledger.
            require(actual == image_id, 'retention-tag-conflict')
            if self.docker('ps', '-aq', '--filter', 'ancestor=' + image_id).strip():
                protected.append(image_id)
            else:
                self.docker('image', 'rm', tag)
        return protected
