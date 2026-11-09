import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { createSourceLiveArtifactPathGuardSmokes } from './source-live-artifact-path-guard-smokes.mjs';

const paths = {
  liveOpenCaptureScriptPath: 'scripts/capture-live-open-connectors.mjs',
  githubTrendingPageCaptureScriptPath: 'scripts/capture-live-github-trending-page.mjs',
  redditLiveCaptureScriptPath: 'scripts/capture-live-reddit-oauth.mjs',
  redditLiveScriptPath: 'scripts/check-live-reddit-oauth.ts',
  localTsNodePath: '/synthetic/node_modules/.bin/ts-node',
};

function harness(execFileSync) {
  const violations = [];
  return {
    ...createSourceLiveArtifactPathGuardSmokes({ ...paths, violations, execFileSync }),
    violations,
  };
}

function diagnostic(args, options) {
  const env = options.env;
  if (args[0] === 'scripts/run-with-timeout.mjs') {
    if (String(env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH).includes('workspace-output')) {
      return 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace';
    }
    return 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must use 0600-style private file permissions';
  }
  if (env.LIVE_OPEN_CONNECTORS_EVIDENCE_PATH) {
    return 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH must not write release evidence into the git workspace';
  }
  if (env.GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH) {
    return 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH must not write release evidence into the git workspace';
  }
  if (String(env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH).includes('workspace-output')) {
    return 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH must not write release evidence into the git workspace';
  }
  return 'REDDIT_LIVE_EVIDENCE_PATH must not write release evidence into the git workspace';
}

function failWith(text) {
  const error = new Error('synthetic rejected output');
  error.status = 1;
  error.stdout = text;
  error.stderr = '';
  throw error;
}

test('four capture path guards preserve diagnostics and original subprocess contract', () => {
  const calls = [];
  const h = harness((binary, args, options) => {
    calls.push({ binary, args, options });
    failWith(diagnostic(args, options));
  });
  h.validateCaptureOutputPathGuards();
  assert.deepEqual(h.violations, []);
  assert.deepEqual(calls.map(x => x.args), [[], [], [], []]);
  assert.deepEqual(calls.map(x => x.binary), Array(4).fill(process.execPath));
  assert.deepEqual(calls.map(x => x.options.stdio), Array(4).fill('pipe'));
  assert.deepEqual(calls.map(x => x.options.encoding), Array(4).fill('utf8'));
  assert.deepEqual(calls.map(x => x.options.env.SOURCE_LIVE_OPERATOR), Array(4).fill('source-owner-1'));
});

test('capture smoke fails closed on unexpectedly successful subprocess execution', () => {
  const h = harness(() => '');
  h.validateCaptureOutputPathGuards();
  assert.equal(h.violations.length, 4);
  assert.ok(h.violations.every(x => x.includes('must reject workspace')));
});

test('capture smoke fails closed on wrong rejection diagnostics', () => {
  const h = harness(() => failWith('unrelated negative output'));
  h.validateCaptureOutputPathGuards();
  assert.equal(h.violations.length, 4);
  assert.ok(h.violations.every(x => x.includes('must explain evidence path policy')));
});

test('direct Reddit lifecycle checks reject workspace paths and public 0644 files and clean up', () => {
  const calls = [];
  const h = harness((binary, args, options) => {
    calls.push({ binary, args, options });
    failWith(diagnostic(args, options));
  });
  h.validateDirectRedditLifecyclePathGuards();
  assert.deepEqual(h.violations, []);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(x => x.binary === process.execPath));
  assert.ok(calls.every(x => x.args.join(' ').includes('--timeout-ms 45000')));
  assert.ok(calls.every(x => x.args.includes(paths.localTsNodePath)));
  assert.ok(calls.every(x => x.options.stdio === 'pipe'));
  assert.equal(existsSync(calls[1].options.env.REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH), false);
});

test('direct Reddit guard fails closed on success or unrelated failure', () => {
  const successful = harness(() => '');
  successful.validateDirectRedditLifecyclePathGuards();
  assert.equal(successful.violations.length, 2);
  const unrelated = harness(() => failWith('unrelated failure'));
  unrelated.validateDirectRedditLifecyclePathGuards();
  assert.equal(unrelated.violations.length, 2);
  assert.ok(unrelated.violations.every(x => x.includes('must explain')));
});
