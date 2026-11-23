"""One fixed intelligence-worker target; API and every other service stay protected."""
import copy
from pathlib import Path, PurePosixPath
from contract import digest, require

SERVICE = 'jev-intelligence-worker'


def _disjoint_targets(paths):
    require(all(isinstance(p, str) and p.startswith('/') and not p.startswith('//') and '\0' not in p and
                '..' not in p.split('/') and str(PurePosixPath(p)) == p for p in paths),
            'worker-mount-target')
    for index, path in enumerate(paths):
        require(all(path != other and not path.startswith(other.rstrip('/') + '/') and
                    not other.startswith(path.rstrip('/') + '/') for other in paths[:index]),
                'worker-mount-overlap')


def _ordered_mounts(value):
    """Order is irrelevant only for mounts with unique, disjoint destinations."""
    declared = []
    for parent, field, target in ((value, 'Mounts', 'Destination'),
                                  (value['HostConfig'], 'Mounts', 'Target')):
        entries = parent.get(field)
        if entries is None:
            continue
        require(isinstance(entries, list) and all(isinstance(e, dict) for e in entries),
                'worker-mount-invalid')
        paths = [entry.get(target) for entry in entries]
        _disjoint_targets(paths)
        parent[field] = sorted(entries, key=lambda entry: entry[target])
        if target == 'Target': declared.extend(paths)
    binds = value['HostConfig'].get('Binds')
    if binds is not None:
        require(isinstance(binds, list) and all(isinstance(b, str) for b in binds),
                'worker-mount-bind')
        for bind in binds:
            parts = bind.split(':')
            require(len(parts) in (2, 3) and bool(parts[0]), 'worker-mount-bind')
            declared.append(parts[1])
        value['HostConfig']['Binds'] = sorted(binds)
    _disjoint_targets(declared)


class WorkerHost:
    def __init__(self, host):
        self.host = host

    @staticmethod
    def policy(value):
        config = value['Config']
        # Image/labels are release identity. All runtime controls remain byte-bound.
        settings = {k: v for k, v in config.items() if k not in ('Image', 'Labels', 'Hostname')}
        host = {k: v for k, v in value['HostConfig'].items() if k != 'RestartPolicy'}
        # Docker29 reports the enabled OOM killer as null after start, false just
        # after create. Only these equivalent defaults normalize; disabling stays bound.
        if host.get('OomKillDisable') is None:
            host['OomKillDisable'] = False
        return digest({'config': settings, 'host': host, 'mounts': value['Mounts']})

    @staticmethod
    def cohort_policy_v1(value):
        """Cohort-only ordering; legacy admissions keep their original raw hash."""
        env = value['Config'].get('Env')
        value = copy.deepcopy(value)
        if env is not None:
            require(isinstance(env, list) and all(isinstance(v, str) and '=' in v and
                    v.split('=', 1)[0] for v in env), 'worker-env-invalid')
            keys = [v.split('=', 1)[0] for v in env]
            require(len(set(keys)) == len(keys), 'worker-env-duplicate')
            value['Config']['Env'] = sorted(env)
        _ordered_mounts(value)
        return WorkerHost.policy(value)

    def signal_ready(self, value):
        pid = value['State']['Pid']
        require(type(pid) is int and pid > 0, 'worker-process')
        status = Path('/proc') / str(pid) / 'status'
        lines = status.read_text().splitlines()
        mask = next(line.split(':', 1)[1].strip() for line in lines if line.startswith('SigCgt:'))
        return bool(int(mask, 16) & (1 << 14))

    def restart(self, ident, policy):
        require(set(policy) == {'Name', 'MaximumRetryCount'} and
                policy['Name'] in ('no', 'always', 'unless-stopped', 'on-failure') and
                type(policy['MaximumRetryCount']) is int and policy['MaximumRetryCount'] >= 0,
                'worker-restart-policy')
        argument = policy['Name']
        if argument == 'on-failure' and policy['MaximumRetryCount']:
            argument += ':' + str(policy['MaximumRetryCount'])
        self.host.docker('update', '--restart=' + argument, ident)

    def configured_restart(self):
        value = self.host.model()['services'][SERVICE].get('restart', 'no')
        require(isinstance(value, str), 'worker-restart-policy')
        name, separator, count = value.partition(':')
        require(name in ('no', 'always', 'unless-stopped', 'on-failure') and
                (not separator or name == 'on-failure' and count.isdigit()), 'worker-restart-policy')
        return {'Name': name, 'MaximumRetryCount': int(count) if separator else 0}

    def term(self, ident):
        self.host.docker('kill', '--signal', 'SIGTERM', ident)

