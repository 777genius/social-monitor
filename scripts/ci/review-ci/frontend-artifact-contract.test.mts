import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { load, CORE_SCHEMA } = require('js-yaml');
const source = readFileSync(new URL('../../../.github/workflows/pull-request.yml', import.meta.url), 'utf8');
type Step = Record<string, unknown> & { with?: Record<string, unknown> };
const workflow = load(source, { schema: CORE_SCHEMA }) as { jobs: { frontend: { steps: Step[] } } };
const steps = workflow.jobs.frontend.steps;
const prepare = steps.find(step => step.name === 'Preserve public bundle and build admin bundle')!;
const upload = steps.find(step => step.name === 'Store qualified public and admin frontend artifact')!;

test('frontend artifacts follow both builds and retain exact main CI provenance', () => {
  const node = steps.find(step => step.name === 'Set up Node 22 for frontend release metadata');
  assert.ok(node && steps.indexOf(node) < steps.indexOf(prepare));
  assert.equal(node.uses, 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e');
  assert.equal(node.with?.['node-version'], 22);
  assert.ok(steps.indexOf(prepare) > steps.findIndex(step => step.name === 'Verify production WebAssembly bundle'));
  assert.ok(steps.indexOf(upload) > steps.indexOf(prepare));
  assert.equal(upload.if, "github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.equal(upload.uses, 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f');
  assert.equal(upload.with!.name, 'frontend-candidate-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(upload.with!['if-no-files-found'], 'error');
  assert.deepEqual((upload.with!.path as string).trim().split('\n'), [
    '${{ runner.temp }}/frontend-release.tgz', '${{ runner.temp }}/frontend-manifest.json',
  ]);
  assert.equal(prepare.if, undefined);
  assert.equal(prepare['continue-on-error'], undefined);
  assert.ok(String(prepare.run).includes('tar --format=ustar -C "$release"'));
  assert.ok(String(prepare.run).includes('node --experimental-strip-types "$GITHUB_WORKSPACE/scripts/ci/frontend-artifact-manifest.mts"'));
  assert.equal(upload['continue-on-error'], undefined);
});

function fixture(options: { publicAdminOrigin?: boolean; staleAdmin?: boolean; invalidRun?: boolean; symlink?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'TEST-sm-frontend-artifact-'));
  const sha = 'a'.repeat(40), bin = join(root, 'bin'), runner = join(root, 'runner');
  mkdirSync(bin); mkdirSync(runner); mkdirSync(join(root, 'build/web'), { recursive: true });
  const bundle = (directory: string, origin: string) => {
    writeFileSync(join(directory, 'index.html'), `flutter_bootstrap.js?v=${sha}`);
    writeFileSync(join(directory, 'flutter_bootstrap.js'), `const configuredRelease = '${sha}'`);
    writeFileSync(join(directory, 'flutter_service_worker.js'), 'self.registration.unregister()');
    writeFileSync(join(directory, 'main.dart.wasm'), 'synthetic wasm');
    writeFileSync(join(directory, 'main.dart.js'), origin);
  };
  bundle(join(root, 'build/web'), options.publicAdminOrigin ? 'https://admin.social-monitor.app' : 'https://social-monitor.app');
  if (options.symlink) symlinkSync('main.dart.js', join(root, 'build/web/alias.js'));
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' '${sha}'\n`, { mode: 0o755 });
  writeFileSync(join(bin, 'flutter'), `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$RUNNER_TEMP/build-invocations"
printf '%s' 'https://admin.social-monitor.app' > build/web/main.dart.js
printf '%s' "const configuredRelease = '${options.staleAdmin ? 'b'.repeat(40) : sha}'" > build/web/flutter_bootstrap.js
`, { mode: 0o755 });
  const result = spawnSync('bash', ['-c', String(prepare.run)], { cwd: root, encoding: 'utf8', timeout: 20_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: runner,
      GITHUB_WORKSPACE: fileURLToPath(new URL('../../../', import.meta.url)),
      GITHUB_SHA: sha, GITHUB_RUN_ID: options.invalidRun ? 'invalid' : '123', GITHUB_RUN_ATTEMPT: '2' } });
  return { root, runner, sha, result };
}

test('packages existing public and one new admin build with bound archive and lane identities', () => {
  const f = fixture();
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    const manifest = JSON.parse(readFileSync(join(f.runner, 'frontend-manifest.json'), 'utf8'));
    const archive = readFileSync(join(f.runner, manifest.archive.name));
    assert.equal(manifest.sourceSha, f.sha);
    assert.equal(manifest.ciRunId, '123'); assert.equal(manifest.ciRunAttempt, '2');
    assert.equal(manifest.archive.sha256, createHash('sha256').update(archive).digest('hex'));
    assert.equal(manifest.archive.bytes, archive.length);
    const staging = spawnSync('python3', ['-B', '-c',
      'import json,sys; from frontend_bundle import stage_frontend_bundle; m=json.load(open(sys.argv[2])); stage_frontend_bundle(sys.argv[1],m,sys.argv[3],"123","2",sys.argv[4])',
      join(f.runner, manifest.archive.name), join(f.runner, 'frontend-manifest.json'), f.sha, f.root], {
      encoding: 'utf8', env: { ...process.env, PYTHONPATH: fileURLToPath(new URL('../../../ops/release/hetzner/', import.meta.url)) },
    });
    assert.equal(staging.status, 0, staging.stderr);
    const tar = gunzipSync(archive);
    for (let cursor = 0; cursor + 512 <= tar.length && tar[cursor] !== 0;) {
      const header = tar.subarray(cursor, cursor + 512);
      assert.equal(header.subarray(257, 263).toString(), 'ustar\0');
      assert.ok(['0', '\0', '5'].includes(header.subarray(156, 157).toString()), 'only ordinary files/directories, no extension headers');
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/u, '').trim(), 8);
      cursor += 512 + Math.ceil(size / 512) * 512;
    }
    for (const lane of ['public', 'admin']) {
      assert.deepEqual(manifest.bundles.find((entry: { lane: string }) => entry.lane === lane), {
        lane, sourceSha: f.sha, ciRunId: '123', ciRunAttempt: '2',
        apiOrigin: lane === 'public' ? 'https://social-monitor.app' : 'https://admin.social-monitor.app',
      });
      const release = spawnSync('tar', ['-xOf', join(f.runner, manifest.archive.name), `${lane}/release-sha.txt`], { encoding: 'utf8' });
      assert.equal(release.status, 0); assert.equal(release.stdout.trim(), f.sha);
      const js = spawnSync('tar', ['-xOf', join(f.runner, manifest.archive.name), `${lane}/main.dart.js`], { encoding: 'utf8' });
      assert.equal(js.status, 0);
      assert.equal(js.stdout, lane === 'public' ? 'https://social-monitor.app' : 'https://admin.social-monitor.app');
    }
    const calls = readFileSync(join(f.runner, 'build-invocations'), 'utf8').trim().split('\n');
    assert.equal(calls.length, 1, 'public must not be rebuilt');
    assert.ok(calls[0]!.includes('--dart-define=SOCIAL_MONITOR_API_BASE_URL=https://admin.social-monitor.app'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

for (const [name, options] of [
  ['public bundle points at admin', { publicAdminOrigin: true }],
  ['admin build has a stale release identity', { staleAdmin: true }],
  ['CI run identity is invalid', { invalidRun: true }],
  ['bundle contains a symlink', { symlink: true }],
] as const) test(`rejects ${name}`, () => {
  const f = fixture(options);
  try { assert.notEqual(f.result.status, 0); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});
