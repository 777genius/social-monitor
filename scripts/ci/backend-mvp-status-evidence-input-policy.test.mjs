import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readStatusEnvFileSelection,
  statusEvidenceInputMode,
} from '../lib/backend-mvp-status-evidence-input-policy.mjs';

const missingValueError = '--env-file requires a non-empty absolute env file path';

test('defaults to shell input without env files', () => {
  assert.equal(statusEvidenceInputMode({}), 'shell_env');
  assert.equal(statusEvidenceInputMode({ envFileCount: 0 }), 'shell_env');
  assert.equal(statusEvidenceInputMode({ envFileCount: -1 }), 'shell_env');
});

test('a positive env file count selects env_file', () => {
  assert.equal(statusEvidenceInputMode({ envFileCount: 1 }), 'env_file');
  assert.equal(statusEvidenceInputMode({ envFileCount: '1' }), 'env_file');
});

test('explicit clean environment takes precedence over env files', () => {
  assert.equal(statusEvidenceInputMode({ cleanEnv: true }), 'clean_env');
  assert.equal(statusEvidenceInputMode({ cleanEnv: true, envFileCount: 3 }), 'clean_env');
  assert.equal(statusEvidenceInputMode({ cleanEnv: false, envFileCount: 3 }), 'env_file');
});

test('mode classifier preserves null input error', () => {
  assert.throws(() => statusEvidenceInputMode(null), TypeError);
});

test('empty argv or unrelated flags select no files', () => {
  assert.deepEqual(readStatusEnvFileSelection([]), { paths: [], errors: [] });
  assert.deepEqual(readStatusEnvFileSelection(['--json']), { paths: [], errors: [] });
});

test('trims and collects repeated file selections in order', () => {
  const argv = ['--json', '--env-file', ' /tmp/a.env ', '--env-file', '/tmp/b.env'];
  const before = [...argv];
  assert.deepEqual(readStatusEnvFileSelection(argv), {
    paths: ['/tmp/a.env', '/tmp/b.env'],
    errors: [],
  });
  assert.deepEqual(argv, before);
});

test('preserves each missing or empty option diagnostic', () => {
  for (const value of [undefined, '', '  ', '--json']) {
    const argv = value === undefined ? ['--env-file'] : ['--env-file', value];
    assert.deepEqual(readStatusEnvFileSelection(argv), {
      paths: [],
      errors: [missingValueError],
    });
  }
});

test('a missing value does not consume a subsequent env-file flag', () => {
  assert.deepEqual(readStatusEnvFileSelection(['--env-file', '--env-file', '/tmp/valid.env']), {
    paths: ['/tmp/valid.env'],
    errors: [missingValueError],
  });
});

test('preserves diagnostics and valid paths together', () => {
  assert.deepEqual(readStatusEnvFileSelection(['--env-file', '/tmp/a', '--env-file']), {
    paths: ['/tmp/a'],
    errors: [missingValueError],
  });
});

test('preserves whitespace-prefixed flags as literal values', () => {
  assert.deepEqual(readStatusEnvFileSelection(['--env-file', ' --json']), {
    paths: ['--json'],
    errors: [],
  });
});

test('does not silently introduce new absolute-path enforcement', () => {
  assert.deepEqual(readStatusEnvFileSelection(['--env-file', 'relative.env']), {
    paths: ['relative.env'],
    errors: [],
  });
});

test('preserves TypeError on non-string selected values', () => {
  assert.throws(() => readStatusEnvFileSelection(['--env-file', 123]), TypeError);
});
