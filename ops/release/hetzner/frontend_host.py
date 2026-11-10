"""Narrow Compose operation for the public/admin frontend pair."""
import copy
from pathlib import Path
from contract import atomic, require, trusted

SERVICE = 'frontend'
MOUNTS = {
    '/usr/share/nginx/public': ('public', True),
    '/usr/share/nginx/admin': ('admin', True),
    '/run/bootstrap/verify-static-release.sh': ('verify-static-release.sh', False),
}


class FrontendHost:
    def __init__(self, host):
        self.host = host

    def snapshot(self):
        before, api = self.host.snapshot()
        targets = [value for value in before['containers'].values()
                   if value['service'] == SERVICE and value['project'] == self.host.c['project']]
        require(len(targets) == 1, 'frontend-target-count')
        target = targets[0]
        containers = {key: value for key, value in before['containers'].items() if key != target['id']}
        containers[api['id']] = api
        return {**before, 'containers': containers}, target

    def up(self, release_root, override, expected_fingerprint):
        """Caller must verify staged bytes and hold the shared release lock."""
        root = trusted(release_root, directory=True)
        require('$' not in str(root), 'frontend-interpolated-path')
        sources = {target: str(trusted(root / name, directory=directory))
                   for target, (name, directory) in MOUNTS.items()}
        require(all('$' not in source for source in sources.values()), 'frontend-interpolated-path')
        before = self.host.model()
        require(SERVICE in before['services'], 'frontend-compose-missing')
        previous = before['services'][SERVICE].get('volumes', [])
        require(isinstance(previous, list), 'frontend-mounts')
        volumes = []
        for target, source in sources.items():
            matched = [item for item in previous if item.get('target') == target]
            require(len(matched) == 1 and matched[0].get('type') == 'bind'
                    and matched[0].get('read_only') is True, 'frontend-mount-binding')
            item = copy.deepcopy(matched[0]); item['source'] = source
            volumes.append(item)
        atomic(Path(override), {'services': {SERVICE: {'volumes': volumes}}})
        after = self.host.model(override)
        _check_scope(before, after, sources)
        require(self.host.compose_fingerprint() == expected_fingerprint, 'trusted-compose-changed')
        self.host.command(self.host.compose(override) +
                          ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', SERVICE])


def _check_scope(before, after, sources):
    require(set(sources) == set(MOUNTS), 'frontend-mount-targets')
    require(SERVICE in before['services'] and SERVICE in after['services'], 'frontend-compose-missing')
    old, new = before['services'][SERVICE].get('volumes', []), after['services'][SERVICE].get('volumes', [])
    require(isinstance(old, list) and isinstance(new, list), 'frontend-mounts')
    for target, source in sources.items():
        prior = [item for item in old if item.get('target') == target]
        current = [item for item in new if item.get('target') == target]
        require(len(prior) == len(current) == 1 and prior[0].get('type') == current[0].get('type') == 'bind'
                and prior[0].get('read_only') is True and current[0].get('read_only') is True
                and current[0].get('source') == source, 'frontend-mount-binding')
        current[0]['source'] = prior[0].get('source')
    require(after == before, 'frontend-compose-scope-changed')
