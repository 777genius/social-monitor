import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync, readFileSync, chmodSync } from 'node:fs';
import { request } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const template = readFileSync(join(repositoryRoot, 'ops/quickstart/nginx.conf.template'), 'utf8');
const release = 'a'.repeat(40);

function reservePort() {
  return new Promise((done, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : done(port));
    });
  });
}

function fetchFixture(port, path, { host = 'localhost', encoding = 'identity', origin } = {}) {
  return new Promise((done, reject) => {
    const req = request({
      hostname: '127.0.0.1', port, path,
      headers: { Host: host, 'Accept-Encoding': encoding, ...(origin ? { Origin: origin } : {}) },
      timeout: 2000,
    }, (response) => {
      const buffers = [];
      response.on('data', (buffer) => buffers.push(buffer));
      response.on('end', () => done({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(buffers),
      }));
      response.once('error', reject);
    });
    req.once('timeout', () => req.destroy(new Error('request timeout')));
    req.once('error', reject);
    req.end();
  });
}

async function waitUntilReady(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetchFixture(port, '/ready');
      if (response.status === 200) return;
    } catch { /* Nginx has not bound the test socket yet. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Nginx did not start');
}

test('real Nginx serves Flutter Web compression, release cache and safe fallbacks', { timeout: 15000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'social-monitor-web-e2e-'));
  const web = join(directory, 'web');
  mkdirSync(web);
  chmodSync(directory, 0o755);
  mkdirSync(join(web, 'assets/fonts'), { recursive: true });
  mkdirSync(join(web, 'canvaskit'));
  const wasm = Buffer.concat([Buffer.from([0, 97, 115, 109]), Buffer.alloc(16_384, 97)]);
  const script = Buffer.from('export const release = "a";\n'.repeat(1000));
  writeFileSync(join(web, 'index.html'), 'SOCIAL MONITOR TEST SHELL');
  writeFileSync(join(web, 'main.dart.wasm'), wasm);
  writeFileSync(join(web, 'main.dart.mjs'), script);
  writeFileSync(join(web, 'main.dart.js'), script);
  writeFileSync(join(web, 'canvaskit/skwasm.wasm'), wasm);
  writeFileSync(join(web, 'assets/fonts/Roboto.ttf'), wasm);
  let nginx;
  try {
    const port = await reservePort();
    const rendered = template
      .replace('listen 80;', `listen 127.0.0.1:${port};`)
      .replace('root /usr/share/nginx/html;', `root ${web};`)
      .replaceAll('${SELFHOST_BEARER_TOKEN}', 'test-token-not-real')
      .replaceAll('http://api:3000', 'http://127.0.0.1:9');
    const config = join(directory, 'nginx.conf');
    writeFileSync(config, `worker_processes 1;\npid ${directory}/nginx.pid;\nerror_log ${directory}/nginx.log warn;\nevents { worker_connections 128; }\nhttp {\n  include /etc/nginx/mime.types;\n  default_type application/octet-stream;\n  access_log off;\n${rendered}\n}\n`);
    const checked = spawnSync('nginx', ['-t', '-p', directory, '-c', config], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.error?.message);
    nginx = spawn('nginx', ['-p', directory, '-c', config, '-g', 'daemon off;'], { stdio: 'ignore' });
    await waitUntilReady(port);

    for (const [name, expectedType, expectedBody] of [
      ['main.dart.wasm', 'application/wasm', wasm],
      ['main.dart.mjs', 'application/javascript', script],
      ['main.dart.js', 'application/javascript', script],
    ]) {
      const response = await fetchFixture(port, `/${name}?v=${release}`, { encoding: 'gzip' });
      assert.equal(response.status, 200, name);
      assert.match(response.headers['content-type'], new RegExp(`^${expectedType}`));
      assert.equal(response.headers['content-encoding'], 'gzip', name);
      assert.match(response.headers.vary ?? '', /Accept-Encoding/i);
      assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable');
      assert.deepEqual(gunzipSync(response.body), expectedBody);
      assert.ok(response.body.length < expectedBody.length / 2);
    }

    for (const path of ['/main.dart.wasm', '/main.dart.js?v=wrong', '/main.dart.mjs?v=' + 'B'.repeat(40)]) {
      const response = await fetchFixture(port, path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers['cache-control'], 'no-cache', path);
    }
    for (const path of ['/canvaskit/skwasm.wasm', '/assets/fonts/Roboto.ttf']) {
      const response = await fetchFixture(port, path, { encoding: 'gzip' });
      assert.equal(response.status, 200);
      assert.equal(response.headers['cache-control'], 'no-cache');
      assert.equal(response.headers['content-encoding'], 'gzip');
      assert.deepEqual(gunzipSync(response.body), wasm);
    }
    const shell = await fetchFixture(port, '/feed');
    assert.equal(shell.status, 200);
    assert.equal(shell.headers['cache-control'], 'no-cache');
    assert.equal(shell.body.toString(), 'SOCIAL MONITOR TEST SHELL');
    unlinkSync(join(web, 'main.dart.wasm'));
    const absent = await fetchFixture(port, `/main.dart.wasm?v=${release}`);
    assert.equal(absent.status, 404, 'missing Wasm must not be substituted with index.html');
    assert.notEqual(absent.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal((await fetchFixture(port, '/assets/missing.ttf')).status, 404);
    assert.equal((await fetchFixture(port, '/canvaskit/missing.wasm')).status, 404);
    assert.equal((await fetchFixture(port, '/ready', { host: 'evil.example' })).status, 403);
    assert.equal((await fetchFixture(port, '/ready', { origin: 'http://evil.example' })).status, 403);
  } finally {
    if (nginx && nginx.exitCode === null) {
      nginx.kill('SIGTERM');
      await Promise.race([
        new Promise((done) => nginx.once('exit', done)),
        new Promise((done) => setTimeout(done, 1000)),
      ]);
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
