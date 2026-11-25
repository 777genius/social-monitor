import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createReleaseDeployArtifactPathSmokes } from './release-deploy-artifact-path-smokes.mjs';

function setup({ mode = 'reject', artifactExists = false, skipDirect = false } = {}) {
  const violations = [];
  const calls = [];
  const fileEvents = [];
  const nodeProcess = {
    execPath: '/synthetic/node',
    env: { INHERITED_FLAG: 'unchanged', ...(skipDirect ? { RELEASE_DEPLOY_SMOKE_DIRECT_PATH_GUARD_TEST: '1' } : {}) },
  };
  const captureScriptPath = '/synthetic/capture';
  const currentScriptPath = '/synthetic/checker';
  const subject = createReleaseDeployArtifactPathSmokes({
    violations, process: nodeProcess, captureScriptPath, currentScriptPath,
    resolve: (name) => '/workspace/' + name,
    existsSync: () => artifactExists,
    mkdtempSync: (prefix) => { fileEvents.push(['mkdtemp', prefix]); return '/tmp/synthetic-release'; },
    join: (...paths) => paths.join('/'),
    tmpdir: () => '/tmp',
    writeFileSync: (path, data, options) => fileEvents.push(['write', path, data, options]),
    chmodSync: (path, modeValue) => fileEvents.push(['chmod', path, modeValue]),
    rmSync: (path, options) => fileEvents.push(['remove', path, options]),
    execFileSync(binary, args, options) {
      calls.push({ binary, args, options });
      if (mode === 'succeed') return '';
      const isDirect = args[0] === currentScriptPath;
      const isCaptureEnv = options.env.RELEASE_DEPLOY_SMOKE_ENV_PATH?.startsWith('/workspace/');
      const isDirectPublicFile = isDirect && options.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH?.startsWith('/tmp/');
      const expected = isDirectPublicFile
        ? 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must use 0600-style private file permissions'
        : isCaptureEnv
          ? 'Evidence env file path must not be inside the git workspace'
          : 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH must not write release evidence into the git workspace';
      throw { status: 7, stdout: 'stderr policy follows', stderr: mode === 'wrong-diagnostic' ? 'unexpected error' : expected };
    },
  });
  return { ...subject, violations, calls, fileEvents, nodeProcess, captureScriptPath, currentScriptPath };
}

test('capture smokes preserve both rejection paths, inherited env and invocation order', () => {
  const h = setup();
  h.validateCaptureOutputPathGuards();
  assert.deepEqual(h.violations, []);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls.map(c => c.args[0]), [h.captureScriptPath, h.captureScriptPath]);
  assert.equal(h.calls[0].binary, h.nodeProcess.execPath);
  assert.equal(h.calls[0].options.env.INHERITED_FLAG, 'unchanged');
  assert.equal(h.calls[0].options.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH, '/workspace/release-deploy-smoke-workspace-output.json');
  assert.equal(h.calls[1].options.env.RELEASE_DEPLOY_SMOKE_ENV_PATH, '/workspace/release-deploy-smoke.env');
  assert.equal(h.calls[0].options.env.BACKEND_IMAGE_DIGEST, 'sha256:' + 'c'.repeat(64));
  assert.equal(h.calls[0].options.encoding, 'utf8');
  assert.equal(h.calls[0].options.stdio, 'pipe');
});

test('capture smokes reject unexpectedly successful child commands', () => {
  const h = setup({ mode: 'succeed' });
  h.validateCaptureOutputPathGuards();
  assert.equal(h.violations.length, 2);
  assert.match(h.violations[0], /must reject workspace RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH/);
  assert.match(h.violations[1], /must reject workspace RELEASE_DEPLOY_SMOKE_ENV_PATH/);
});

test('capture smokes reject missing policy diagnostics', () => {
  const h = setup({ mode: 'wrong-diagnostic' });
  h.validateCaptureOutputPathGuards();
  assert.equal(h.violations.length, 2);
  assert.match(h.violations[0], /must explain evidence path policy/);
  assert.match(h.violations[1], /must explain evidence env path policy/);
});

test('capture smokes fail closed if forbidden workspace artifacts exist', () => {
  const h = setup({ artifactExists: true });
  h.validateCaptureOutputPathGuards();
  assert.equal(h.violations.length, 2);
  assert.ok(h.violations.every(x => x.includes('must not create')));
});

test('direct smokes preserve self-execution, private file mode and finally cleanup', () => {
  const h = setup();
  h.validateDirectArtifactPathGuards();
  assert.deepEqual(h.violations, []);
  assert.deepEqual(h.calls.map(x => x.args[0]), [h.currentScriptPath, h.currentScriptPath]);
  assert.ok(h.calls.every(x => x.options.env.RELEASE_DEPLOY_SMOKE_DIRECT_PATH_GUARD_TEST === '1'));
  assert.equal(h.calls[0].options.env.RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH, '/workspace/release-deploy-smoke-direct-workspace-output.json');
  assert.deepEqual(h.fileEvents[1], ['write', '/tmp/synthetic-release/release-deploy-smoke.json', '{}\n', { mode: 0o600 }]);
  assert.deepEqual(h.fileEvents[2], ['chmod', '/tmp/synthetic-release/release-deploy-smoke.json', 0o644]);
  assert.deepEqual(h.fileEvents.at(-1), ['remove', '/tmp/synthetic-release', { recursive: true, force: true }]);
});

test('direct smokes fail closed on success and missing policy diagnostics', () => {
  for (const mode of ['succeed', 'wrong-diagnostic']) {
    const h = setup({ mode });
    h.validateDirectArtifactPathGuards();
    assert.equal(h.violations.length, 2, mode);
    assert.equal(h.fileEvents.at(-1)[0], 'remove');
  }
});

test('direct guard recursion flag skips both self checks without side effects', () => {
  const h = setup({ skipDirect: true });
  h.validateDirectArtifactPathGuards();
  assert.deepEqual(h.violations, []);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.fileEvents, []);
});

test('direct guard detects a forbidden workspace output even after policy rejection', () => {
  const h = setup({ artifactExists: true });
  h.validateDirectArtifactPathGuards();
  assert.equal(h.violations.length, 1);
  assert.match(h.violations[0], /workspace artifact rejection must not create/);
  assert.equal(h.fileEvents.at(-1)[0], 'remove');
});

test('checker keeps active ordered calls and imports the extracted guard owner', () => {
  const source = readFileSync(new URL('../check-release-artifact-evidence.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ createReleaseDeployArtifactPathSmokes \} from '\.\/lib\/release-deploy-artifact-path-smokes\.mjs'/);
  const from = source.indexOf('validateCaptureScriptWiring();');
  const to = source.indexOf("if (artifact.status === 'passed')", from);
  assert.ok(from >= 0 && to > from);
  const live = source.slice(from, to);
  assert.match(live, /createReleaseDeployArtifactPathSmokes\(\{/);
  assert.match(live, /validateCaptureOutputPathGuards\(\);\s*validateDirectArtifactPathGuards\(\);/);
});
