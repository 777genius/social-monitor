"""The fixed API + intelligence-worker cohort; all other containers remain fenced."""
import json
import re
from datetime import datetime
from contract import atomic, digest, require, read_json
from worker_host import SERVICE, WorkerHost

TARGETS = ('api', SERVICE)


class BackendHost:
    def __init__(self, host, root):
        self.host, self.root = host, root
        self.worker = WorkerHost(host)

    def snapshot(self, complete=True):
        snapshot, targets = self.host.snapshot(target_services=TARGETS, allow_missing_targets=not complete)
        by_service = {service: [v for v in targets if v['service'] == service] for service in TARGETS}
        require(all(len(v) <= 1 for v in by_service.values()), 'backend-target-count')
        if complete:
            require(all(len(v) == 1 for v in by_service.values()), 'backend-target-count')
        return snapshot, {k: v[0] for k, v in by_service.items() if v}

    def inspect(self, target):
        values = json.loads(self.host.docker('inspect', target['id']))
        require(isinstance(values, list) and len(values) == 1, 'backend-inspect')
        value = values[0]
        labels = value['Config'].get('Labels') or {}
        require(value['Id'] == target['id'] and value['Image'] == target['image'] and
                labels.get('com.docker.compose.service') == target['service'] and
                labels.get('com.docker.compose.project') == self.host.c['project'], 'backend-inspect-binding')
        return value

    @staticmethod
    def policy(value, service):
        return (digest({'runtime': WorkerHost.policy(value),
                        'restart_policy': value['HostConfig']['RestartPolicy']})
                if service == 'api' else WorkerHost.policy(value))

    def assert_runtime_model(self, values, key):
        override = self.root / 'overrides' / (key + '-validation.json')
        atomic(override, {'services': {s: {'image': v['Image']} for s, v in values.items()}})
        for service, value in values.items():
            output = self.host.command(self.host.compose(override) + ['--profile', '*', 'config', '--hash', service])
            parts = output.decode().strip().split()
            require(len(parts) == 2 and parts[0] == service and re.fullmatch(r'[0-9a-f]{64}', parts[1]) and
                    (value['Config'].get('Labels') or {}).get('com.docker.compose.config-hash') == parts[1],
                    'backend-runtime-model-drift')

    def created_after(self, value, intent_ns):
        created = datetime.fromisoformat(value['Created'].replace('Z', '+00:00')).timestamp()
        require(created >= intent_ns / 1_000_000_000, 'backend-recreation-time')
        self.roots_match({value['Config']['Labels']['com.docker.compose.service']: value})

    def roots_match(self, values):
        # A running manual overlay must be reconciled into trusted roots first. Image-only
        # overrides made by this protocol are the sole permitted additional input.
        roots = self.host.c['compose_files']
        for value in values.values():
            files = (value['Config'].get('Labels') or {}).get('com.docker.compose.project.config_files', '').split(',')
            require(files[:len(roots)] == roots and len(files) in (len(roots), len(roots) + 1),
                    'backend-runtime-roots-drift')
            if len(files) > len(roots):
                from pathlib import Path
                path = Path(files[-1])
                require(path.parent == self.root / 'overrides' and not path.is_symlink(),
                        'backend-runtime-overlay-drift')
                model = read_json(path)
                require(set(model) == {'services'} and set(model['services']) == set(TARGETS) and
                        all(set(model['services'][s]) == {'image'} for s in TARGETS), 'backend-runtime-overlay-drift')
                require(model['services'][value['Config']['Labels']['com.docker.compose.service']]['image'] ==
                        value['Image'], 'backend-runtime-overlay-image')

    def up(self, images, override, compose_hash, service):
        require(set(images) == set(TARGETS) and service in TARGETS, 'backend-compose-scope')
        atomic(override, {'services': {s: {'image': images[s]} for s in TARGETS}})
        before, after = self.host.model(), self.host.model(override)
        for name in TARGETS:
            require(name in before['services'] and after['services'][name]['image'] == images[name],
                    'backend-compose-missing')
            after['services'][name]['image'] = before['services'][name].get('image')
            if 'image' not in before['services'][name]:
                del after['services'][name]['image']
        require(before == after and self.host.compose_fingerprint() == compose_hash, 'backend-compose-changed')
        self.host.command(self.host.compose(override) +
            ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service])

    def start_created(self, target, value):
        require(not value['State']['Running'] and value['State'].get('Status') == 'created' and
                value['State']['StartedAt'].startswith('0001-01-01T00:00:00') and
                value['RestartCount'] == 0, 'backend-created-start-state')
        self.host.docker('start', target['id'])

    def ready(self, target, admission, image, revision):
        if not target['running'] or target['image'] != image:
            return False
        if target['service'] == 'api':
            return self.host.probe(image, revision)
        proof = self.host.evidence('worker-probe', {'container_id': target['id'], 'image_id': image,
            'sha': revision, 'runtime_sha256': admission['runtime_sha256'][SERVICE],
            'restart_policy_sha256': digest(admission['restart_policy'])})
        return proof.get('ready') is True and proof.get('service') == SERVICE
