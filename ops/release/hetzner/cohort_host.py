"""Fixed three-target host operations; the caller owns the release lock and journal."""
import json
from pathlib import Path
import re

import cohort_compose
from contract import DIGEST, atomic, read_json, require, trusted
from frontend_host import FrontendHost
from worker_host import SERVICE

TARGETS = ('api', SERVICE, 'frontend')


class CohortHost:
    def __init__(self, host, root):
        self.host, self.root = host, Path(root)
        self.frontend = FrontendHost(host)

    def snapshot(self, complete=True):
        snapshot, targets = self.host.snapshot(target_services=TARGETS, allow_missing_targets=not complete)
        require(isinstance(targets, list) and all(isinstance(item, dict) and item.get('service') in TARGETS and
                item.get('project') == self.host.c['project'] for item in targets), 'cohort-target-binding')
        by_service = {service: [item for item in targets if item['service'] == service] for service in TARGETS}
        require(all(len(items) <= 1 for items in by_service.values()) and
                len({item['id'] for item in targets}) == len(targets), 'cohort-target-count')
        if complete:
            require(all(len(items) == 1 for items in by_service.values()), 'cohort-target-count')
        return snapshot, {service: items[0] for service, items in by_service.items() if items}

    def inspect(self, target):
        require(isinstance(target, dict) and target.get('service') in TARGETS and
                target.get('project') == self.host.c['project'] and
                isinstance(target.get('id'), str) and re.fullmatch(r'[0-9a-f]{64}', target['id']) and
                isinstance(target.get('image'), str) and re.fullmatch(DIGEST, target['image']),
                'cohort-inspect-target')
        values = json.loads(self.host.docker('inspect', target['id']))
        require(isinstance(values, list) and len(values) == 1 and isinstance(values[0], dict), 'cohort-inspect')
        value = values[0]
        labels = value.get('Config', {}).get('Labels') or {}
        require(value.get('Id') == target['id'] and value.get('Image') == target['image'] and
                labels.get('com.docker.compose.project') == self.host.c['project'] and
                labels.get('com.docker.compose.service') == target['service'], 'cohort-inspect-binding')
        return value

    def _override_path(self, path, existing=False):
        path = Path(path)
        require(path.is_absolute() and path.parent == self.root / 'overrides' and
                re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json', path.name), 'cohort-override-path')
        trusted(path.parent, directory=True)
        if existing:
            trusted(path)
        return path

    def current_sources(self, frontend_target, effective_override=None):
        """Capture exact live bind sources; never infer a common previous release root.

        Caller holds the release lock. A retained cohort override must have trusted
        root custody and the exact five-field Compose scope, including saved bind options.
        """
        require(isinstance(frontend_target, dict) and frontend_target.get('service') == 'frontend',
                'cohort-frontend-target')
        value = self.inspect(frontend_target)
        path = self._override_path(effective_override, existing=True) if effective_override is not None else None
        labels = value['Config']['Labels']
        expected_roots = [*self.host.c['compose_files'], *([str(path)] if path is not None else [])]
        require(labels.get('com.docker.compose.project.config_files', '').split(',') == expected_roots,
                'cohort-runtime-roots-drift')
        result = self.frontend.current_sources(value, path)
        if path is not None:
            before, after = self.host.model(), self.host.model(path)
            images = {service: after['services'][service]['image'] for service in cohort_compose.BACKEND}
            cohort_compose.check_scope(before, after, images, result['sources'])
            require(read_json(path) == cohort_compose.override(before, images, result['sources']),
                    'cohort-runtime-override-drift')
        after = self.inspect(frontend_target)
        require((after['Id'], after['Image'], after.get('Mounts'), after['Config']['Labels']) ==
                (value['Id'], value['Image'], value.get('Mounts'), value['Config']['Labels']),
                'cohort-frontend-race')
        require(after.get('RestartCount') == value.get('RestartCount') and
                all(after.get('State', {}).get(key) == value.get('State', {}).get(key)
                    for key in ('Pid', 'StartedAt', 'Running')), 'cohort-frontend-race')
        return result

    def up(self, images, sources, override_path, expected_fingerprint, service):
        """Apply only one fixed service. Inputs are journaled forward or previous values.

        No drain, readiness, rollback policy or implicit dependency startup lives here.
        The caller must bind the resulting container/image and persist its observation.
        """
        require(service in TARGETS, 'cohort-compose-service')
        path = self._override_path(override_path)
        before = self.host.model()
        document = cohort_compose.override(before, images, sources)
        require(self.host.compose_fingerprint() == expected_fingerprint, 'trusted-compose-changed')
        atomic(path, document)
        after = self.host.model(path)
        cohort_compose.check_scope(before, after, images, sources)
        require(self.host.compose_fingerprint() == expected_fingerprint, 'trusted-compose-changed')
        self.host.command(self.host.compose(path) +
            ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service])
