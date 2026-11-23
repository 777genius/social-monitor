"""Narrow Compose operation for the public/admin frontend pair."""
import copy
import json
import os
from pathlib import Path
from contract import atomic, private_file_digest, require, trusted

SERVICE = 'frontend'
MOUNTS = {
    '/usr/share/nginx/public': ('public', True),
    '/usr/share/nginx/admin': ('admin', True),
    '/run/bootstrap/verify-static-release.sh': ('verify-static-release.sh', False),
}


def reject_shadow_mounts(mounts, key):
    """A parent or child mount may silently hide part of a managed frontend path."""
    require(isinstance(mounts, list), 'frontend-mounts')
    for item in mounts:
        require(isinstance(item, dict) and isinstance(item.get(key), str), 'frontend-mounts')
        path = item[key].rstrip('/') or '/'
        for target in MOUNTS:
            require(path == target or not (path.startswith(target + '/') or
                    target.startswith(path.rstrip('/') + '/')), 'frontend-shadow-mount')


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

    def current_sources(self, inspected, override=None):
        """Caller binds inspect to the frontend ID and verifies any effective override."""
        model = self.host.model(override)
        service = model.get('services', {}).get(SERVICE)
        require(isinstance(service, dict) and isinstance(service.get('volumes'), list), 'frontend-mounts')
        reject_shadow_mounts(service['volumes'], 'target')
        sources = {}
        for target, (_, directory) in MOUNTS.items():
            matches = [item for item in service['volumes'] if isinstance(item, dict) and item.get('target') == target]
            require(len(matches) == 1 and matches[0].get('type') == 'bind'
                    and matches[0].get('read_only') is True and isinstance(matches[0].get('source'), str),
                    'frontend-mount-binding')
            source = matches[0]['source']
            require('$' not in source, 'frontend-interpolated-path')
            sources[target] = str(trusted(source, directory=directory))
        mounts = inspected.get('Mounts') if isinstance(inspected, dict) else None
        require(isinstance(mounts, list), 'frontend-live-mounts')
        reject_shadow_mounts(mounts, 'Destination')
        for target, source in sources.items():
            actual = [item for item in mounts if isinstance(item, dict) and item.get('Destination') == target]
            require(len(actual) == 1 and actual[0].get('Type') == 'bind'
                    and actual[0].get('Source') == source and actual[0].get('RW') is False,
                    'frontend-live-mount-drift')
        verifier = sources['/run/bootstrap/verify-static-release.sh']
        state = inspected.get('State', {})
        ident, pid = inspected.get('Id'), state.get('Pid')
        require(isinstance(ident, str) and len(ident) == 64 and type(pid) is int and pid > 0
                and state.get('Running') is True and isinstance(state.get('StartedAt'), str)
                and type(inspected.get('RestartCount')) is int, 'frontend-live-process')
        try:
            initial = {}
            for target, source in sources.items():
                host_file = os.stat(source)
                live_file = os.stat('/proc/' + str(pid) + '/root' + target)
                initial[target] = (host_file.st_dev, host_file.st_ino)
                require(initial[target] == (live_file.st_dev, live_file.st_ino), 'frontend-live-inode-drift')
            checksum = private_file_digest(verifier)
            for target, source in sources.items():
                host_after = os.stat(source)
                live_after = os.stat('/proc/' + str(pid) + '/root' + target)
                require(initial[target] == (host_after.st_dev, host_after.st_ino) ==
                        (live_after.st_dev, live_after.st_ino), 'frontend-live-inode-drift')
            observed = json.loads(self.host.docker('inspect', ident))
            require(isinstance(observed, list) and len(observed) == 1, 'frontend-live-process')
            actual = observed[0]
            require(actual.get('Id') == ident and actual.get('RestartCount') == inspected['RestartCount']
                    and actual.get('State', {}).get('Pid') == pid
                    and actual['State'].get('Running') is True
                    and actual['State'].get('StartedAt') == state['StartedAt'], 'frontend-live-process')
        except (OSError, ValueError, KeyError, TypeError):
            require(False, 'frontend-live-verifier-unavailable')
        return {'sources': sources, 'verifier_sha256': checksum}

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
    reject_shadow_mounts(old, 'target'); reject_shadow_mounts(new, 'target')
    for target, source in sources.items():
        prior = [item for item in old if item.get('target') == target]
        current = [item for item in new if item.get('target') == target]
        require(len(prior) == len(current) == 1 and prior[0].get('type') == current[0].get('type') == 'bind'
                and prior[0].get('read_only') is True and current[0].get('read_only') is True
                and current[0].get('source') == source, 'frontend-mount-binding')
        current[0]['source'] = prior[0].get('source')
    require(after == before, 'frontend-compose-scope-changed')
