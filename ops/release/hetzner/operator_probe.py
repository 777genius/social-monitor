"""Observe /ready using a fixed Node HTTP program inside one exact container."""
from contract import require
from operator_config import EXECUTABLES, decode, exact, match

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
