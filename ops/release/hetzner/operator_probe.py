"""Observe /ready using a fixed Node HTTP program inside one exact container."""
from contract import require
from operator_config import EXECUTABLES, decode, exact, match
from contract import digest
from worker_host import SERVICE, WorkerHost

INSPECT = ('{"id":{{json .Id}},"image":{{json .Image}},'
           '"started":{{json .State.StartedAt}},"running":{{json .State.Running}},'
           '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
           '"service":{{json (index .Config.Labels "com.docker.compose.service")}}}')
HTTP = r'''const http = require('node:http');
const req = http.get('http://127.0.0.1:3000/ready', {timeout: 4000}, res => {
  let size = 0; const chunks = [];
  res.on('data', b => { size += b.length; if (size > 262144) req.destroy(); else chunks.push(b); });
  res.on('end', () => {
    try { process.stdout.write(JSON.stringify({http_status: res.statusCode,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))})); }
    catch { process.exitCode = 1; }
  });
  res.on('error', () => { process.exitCode = 1; });
});
const timer = setTimeout(() => { req.destroy(); process.exitCode = 1; }, 5000);
req.on('timeout', () => req.destroy());
req.on('error', () => { process.exitCode = 1; });
req.on('close', () => clearTimeout(timer));'''


def inspect(runner, selector):
    raw = runner.run([EXECUTABLES['docker'], 'inspect', '--format', INSPECT, selector], limit=4096)
    value = decode(raw, 4096)
    exact(value, ('id', 'image', 'started', 'running', 'project', 'service'))
    require(match(r'[0-9a-f]{64}', value['id']) and match(r'sha256:[0-9a-f]{64}', value['image'])
            and isinstance(value['started'], str) and value['started']
            and value['running'] is True and value['service'] == 'api'
            and value['project'] == 'platform-social-monitor', 'operator-probe-container')
    return value


def probe(config, runner, binding):
    config.recheck()
    before = inspect(runner, binding['container_id'])
    require(before['id'] == binding['container_id'] and before['image'] == binding['image_id'],
            'operator-probe-target')
    raw = runner.run([EXECUTABLES['docker'], 'exec', binding['container_id'],
                      '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin',
                      '/usr/local/bin/node', '--no-addons', '-e', HTTP], limit=300000)
    value = decode(raw, 300000)
    exact(value, ('http_status', 'body'))
    body = value['body']
    require(type(value['http_status']) is int and value['http_status'] == 200
            and isinstance(body, dict) and body.get('status') == 'ok'
            and body.get('service') == 'api-gateway'
            and isinstance(body.get('checks'), list) and len(body['checks']) <= 32,
            'operator-probe-http')
    checks = body['checks']
    require(all(isinstance(check, dict) and isinstance(check.get('name'), str)
                and check.get('status') in ('ok', 'degraded') for check in checks)
            and len({check['name'] for check in checks}) == len(checks), 'operator-probe-checks')
    pool = [check for check in checks if check['name'] == 'postgres_runtime_pool']
    # Actual health-reporter schema distinguishes a real query from a skipped pool.
    require(len(pool) == 1 and pool[0]['status'] == 'ok'
            and pool[0].get('detail') == 'A query completed through the bounded shared Prisma pool.',
            'operator-probe-pool')
    require(inspect(runner, binding['container_id']) == before, 'operator-probe-race')
    config.recheck()
    return {'transport': 'docker-exec-http', 'http_status': 200, 'status': 'ok',
            'service': 'api-gateway', 'postgres_pool_ok': True, 'ready': True}


def worker_probe(config, runner, binding):
    """Observe bootstrap completion, not a synthetic job or model request."""
    def observation():
        raw = runner.run([EXECUTABLES['docker'], 'inspect', binding['container_id']], limit=2 * 1024**2)
        values = decode(raw, 2 * 1024**2)
        require(isinstance(values, list) and len(values) == 1, 'worker-probe-inspect')
        item = values[0]
        labels = item['Config'].get('Labels') or {}
        require(item['Id'] == binding['container_id'] and item['Image'] == binding['image_id'] and
                labels.get('com.docker.compose.project') == config.core['project'] and
                labels.get('com.docker.compose.service') == SERVICE and
                item['State']['Running'] and not item['State']['Restarting'] and
                WorkerHost.policy(item) == binding['runtime_sha256'] and
                digest(item['HostConfig']['RestartPolicy']) == binding['restart_policy_sha256'],
                'worker-probe-binding')
        return item
    config.recheck()
    before = observation()
    labels = decode(runner.run([EXECUTABLES['docker'], 'image', 'inspect', '--format',
                               '{{json .Config.Labels}}', binding['image_id']], limit=65536), 65536)
    require(labels.get('org.opencontainers.image.revision') == binding['sha'], 'worker-probe-revision')
    require(WorkerHost(None).signal_ready(before), 'worker-probe-bootstrap')
    after = observation()
    require((before['Id'], before['State'], before['RestartCount']) ==
            (after['Id'], after['State'], after['RestartCount']), 'worker-probe-race')
    config.recheck()
    return {'service': SERVICE, 'transport': 'docker-process', 'ready': True}


def worker_drain(config, runner, binding):
    """A marker from the exact signalled process plus terminal Docker state, never bare143."""
    import json
    from datetime import datetime
    config.recheck()
    def observe():
        values = decode(runner.run([EXECUTABLES['docker'], 'inspect', binding['container_id']],
                                   limit=2 * 1024**2), 2 * 1024**2)
        require(isinstance(values, list) and len(values) == 1, 'worker-drain-inspect')
        item = values[0]
        labels = item['Config'].get('Labels') or {}
        require(item['Id'] == binding['container_id'] and item['Image'] == binding['image_id'] and
                labels.get('com.docker.compose.project') == config.core['project'] and
                labels.get('com.docker.compose.service') == SERVICE and
                digest(item['State']['StartedAt']) == binding['started_at_sha256'] and
                str(item['RestartCount']) == binding['restart_count'] and
                not item['State']['Running'] and not item['State']['OOMKilled'] and
                item['State']['ExitCode'] in (0, 143) and
                item['HostConfig']['RestartPolicy'] == {'Name': 'no', 'MaximumRetryCount': 0},
                'worker-drain-state')
        return item
    before = observe()
    # Bounded runner terminates oversized output. --since and container ID exclude an
    # earlier lifecycle. Strict JSON-only lines exclude ordinary provider/user logs.
    since = str(int(binding['signal_since_ms']) // 1000)
    logs = runner.run([EXECUTABLES['docker'], 'logs', '--since', since, '--tail', '1000',
                       binding['container_id']], limit=2 * 1024**2)
    found = []
    for line in logs.decode('utf-8', errors='replace').splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if not isinstance(item, dict) or set(item) != {'marker', 'signal', 'pid', 'completed_at_ms'}:
            continue
        if (item['marker'] == 'social-monitor-worker-modules-drained-v1' and item['signal'] == 'SIGTERM'
                and item['pid'] == 1 and type(item['pid']) is int and type(item['completed_at_ms']) is int
                and int(binding['signal_since_ms']) <= item['completed_at_ms'] <=
                    datetime.fromisoformat(before['State']['FinishedAt'].replace('Z', '+00:00')).timestamp() * 1000):
            found.append(item)
    require(len(found) == 1, 'worker-drain-marker')
    require(observe() == before, 'worker-drain-race')
    config.recheck()
    return {'drained': True, 'service': SERVICE, 'marker': found[0]}


def worker_capability(config, runner, binding):
    """Only inspect deployed code; this never imports or boots the application."""
    def observation():
        values = decode(runner.run([EXECUTABLES['docker'], 'inspect', binding['container_id']],
                                   limit=2 * 1024**2), 2 * 1024**2)
        require(isinstance(values, list) and len(values) == 1, 'worker-capability-inspect')
        value = values[0]
        labels = value['Config'].get('Labels') or {}
        require(value['Id'] == binding['container_id'] and value['Image'] == binding['image_id'] and
                value['State']['Running'] and not value['State']['Restarting'] and
                labels.get('com.docker.compose.project') == config.core['project'] and
                labels.get('com.docker.compose.service') == SERVICE, 'worker-capability-binding')
        return value
    config.recheck()
    before = observation()
    script = ("grep -Fxq node /proc/1/comm && grep -Fq 'social-monitor-worker-modules-drained-v1' "
              "/app/dist/apps/intelligence-worker/src/worker-shutdown-marker.js && "
              "grep -Fq 'worker-shutdown-marker' /app/dist/apps/intelligence-worker/src/intelligence-worker.module.js && "
              "grep -Fq 'WorkerShutdownMarker' /app/dist/apps/intelligence-worker/src/intelligence-worker.module.js")
    runner.run([EXECUTABLES['docker'], 'exec', binding['container_id'], '/bin/sh', '-c', script], limit=4096)
    runner.run([EXECUTABLES['docker'], 'logs', '--tail', '0', binding['container_id']], limit=4096)
    source = runner.run([EXECUTABLES['docker'], 'exec', binding['container_id'], 'sha256sum',
                        '/app/node_modules/@nestjs/core/nest-application-context.js'], limit=4096)
    require(source.decode().split() == [
        '2e4f6131799125e3098bbdab8701b7380123ea2841799ebe932f190c21cb9d11',
        '/app/node_modules/@nestjs/core/nest-application-context.js'], 'worker-signal-replay-source')
    require(observation() == before, 'worker-capability-race')
    config.recheck()
    return {'supported': True, 'service': SERVICE, 'capability': 'modules-drained-v1',
            'signal_replay': 'nest-guarded-v1'}
