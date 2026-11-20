import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createExternalBetaEnvFileLoader } from './external-beta-evidence-env-file-loader.mjs';

function harness({ env = {}, files = {}, rejected = [] } = {}) {
  const reads = [];
  const { loadExternalBetaEnvFiles } = createExternalBetaEnvFileLoader({
    env,
    validateExternalBetaEnvFilePath(path, label, violations) {
      if (rejected.includes(path)) violations.push(label + ': path must be private');
    },
    readFileSync(path, encoding) {
      reads.push([path, encoding]);
      return files[path];
    },
    parseDotenv(content) { return JSON.parse(content); },
  });
  return { loadExternalBetaEnvFiles, env, reads };
}

test('preserves ordered parsing, trimming, empty omission and live shell env reference', () => {
  const env = { SHELL: 'present' };
  const h = harness({ env, files: {
    '/one.env': JSON.stringify({ ALPHA: '  first  ', EMPTY: '   ', SHELL: 'present' }),
    '/two.env': JSON.stringify({ ALPHA: 'first', BETA: ' value ' }),
  } });
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/one.env', '/two.env']), []);
  assert.equal(h.env, env);
  assert.deepEqual(env, { SHELL: 'present', ALPHA: 'first', BETA: 'value' });
  assert.deepEqual(h.reads, [['/one.env', 'utf8'], ['/two.env', 'utf8']]);
});

test('invalid file path blocks reads while preserving later valid-file admission', () => {
  const h = harness({ files: { '/safe.env': JSON.stringify({ SAFE: 'accepted' }) }, rejected: ['/unsafe.env'] });
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/unsafe.env', '/safe.env']),
    ['--env-file /unsafe.env: path must be private']);
  assert.deepEqual(h.reads, [['/safe.env', 'utf8']]);
  assert.equal(h.env.SAFE, 'accepted');
});

test('rejects non-uppercase variables and refuses execution confirmation from private files', () => {
  const h = harness({ files: { '/values.env': JSON.stringify({
    'lower-name': 'oops', EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live', OK: 'yes',
  }) } });
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/values.env']), [
    '--env-file /values.env: env name lower-name is not a valid uppercase env var name',
    '--env-file /values.env: EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell, not loaded from --env-file',
  ]);
  assert.deepEqual(h.env, { OK: 'yes' });
});

test('fail-closes shell and earlier-file conflicts without overriding already admitted values', () => {
  const h = harness({ env: { SHELL: 'original' }, files: {
    '/first.env': JSON.stringify({ KEY: 'one', SHELL: 'override' }),
    '/second.env': JSON.stringify({ KEY: 'different', NEXT: 'ok' }),
  } });
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/first.env', '/second.env']), [
    '--env-file /first.env: env SHELL conflicts with the shell environment; refusing to merge evidence from different runs',
    '--env-file /second.env: env KEY conflicts with --env-file /first.env; refusing to merge evidence from different runs',
  ]);
  assert.deepEqual(h.env, { SHELL: 'original', KEY: 'one', NEXT: 'ok' });
});

test('fresh call resets loaded-source tracking but not live env state', () => {
  const h = harness({ files: {
    '/one.env': JSON.stringify({ KEY: 'first' }), '/two.env': JSON.stringify({ KEY: 'second' }),
  } });
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/one.env']), []);
  assert.deepEqual(h.loadExternalBetaEnvFiles(['/two.env']), [
    '--env-file /two.env: env KEY conflicts with the shell environment; refusing to merge evidence from different runs',
  ]);
});

test('real runner invokes extracted loader and does not keep a second implementation', () => {
  const source = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /createExternalBetaEnvFileLoader\(\{/);
  assert.match(source, /const envFileViolations = loadExternalBetaEnvFiles\(envFileSelection\.paths\)/);
  assert.doesNotMatch(source, /function loadExternalBetaEnvFiles\(/);
});
