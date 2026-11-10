"""One fixed intelligence-worker target; API and every other service stay protected."""
from pathlib import Path
from contract import digest, require

SERVICE = 'jev-intelligence-worker'


class WorkerHost:
    def __init__(self, host):
        self.host = host

    @staticmethod
    def policy(value):
        config = value['Config']
        # Image/labels are release identity. All runtime controls remain byte-bound.
        settings = {k: v for k, v in config.items() if k not in ('Image', 'Labels', 'Hostname')}
        host = {k: v for k, v in value['HostConfig'].items() if k != 'RestartPolicy'}
        return digest({'config': settings, 'host': host, 'mounts': value['Mounts']})

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

