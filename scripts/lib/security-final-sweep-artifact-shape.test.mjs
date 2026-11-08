import assert from 'node:assert/strict';
import test from 'node:test';
import {
  scanForbiddenArtifactKeys,
  validateNoRealArtifactFixtureMarkers,
} from './security-final-sweep-artifact-shape.mjs';

const forbiddenArtifactKeys = new Set(['token', 'api_key', 'apikey', 'rawpayload']);
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;
function context(violations) {
  return { forbiddenArtifactKeys, forbiddenRealArtifactMarkerPattern, violations };
}

test('sensitive top-level keys retain the original diagnostic', () => {
  const violations = [];
  scanForbiddenArtifactKeys({ token: 'redacted' }, 'sample', context(violations));
  assert.deepEqual(violations, ['sample: forbidden sensitive field "token"']);
});

test('sensitive nested array keys retain traversal order and parent label', () => {
  const violations = [];
  scanForbiddenArtifactKeys({
    records: [{ 'To-ken': 'redacted', 'raw-payload': null }, { api_key: false }],
    other: { safeField: true },
  }, 'sample', context(violations));
  assert.deepEqual(violations, [
    'sample.records[0]: forbidden sensitive field "To-ken"',
    'sample.records[0]: forbidden sensitive field "raw-payload"',
    'sample.records[1]: forbidden sensitive field "api_key"',
  ]);
});

test('field name normalization remains case sensitive only after normalization', () => {
  const violations = [];
  scanForbiddenArtifactKeys({ 'API-KEY': null, 'ordinary-value': 1 }, 'fixture', context(violations));
  assert.deepEqual(violations, ['fixture: forbidden sensitive field "API-KEY"']);
});

test('primitive, null, and safe data stay accepted without mutation', () => {
  const data = { entries: [null, 0, false, { safeName: 'redacted' }] };
  const snapshot = globalThis.structuredClone(data);
  const violations = [];
  scanForbiddenArtifactKeys(data, 'sample', context(violations));
  scanForbiddenArtifactKeys(null, 'sample', context(violations));
  assert.deepEqual(data, snapshot);
  assert.deepEqual(violations, []);
});

test('root fixture marker still reports the root field label', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers('release_example', 'artifact', context(violations));
  assert.deepEqual(violations, ['artifact: <root> must not contain fixture marker "example"']);
});

test('fixture marker search remains recursive through objects and arrays', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers({
    event: [{ name: 'production-mock' }, { name: 'clean' }],
    generated: 'a_test_run',
  }, 'artifact', context(violations));
  assert.deepEqual(violations, [
    'artifact: event.[0].name must not contain fixture marker "mock"',
    'artifact: generated must not contain fixture marker "test"',
  ]);
});

test('marker recognition retains case-insensitivity and token boundaries', () => {
  const violations = [];
  validateNoRealArtifactFixtureMarkers(['TEST', 'contest', 'Tested', 'synthetic-run'], 'record', context(violations));
  assert.deepEqual(violations, [
    'record: [0] must not contain fixture marker "TEST"',
    'record: [3] must not contain fixture marker "synthetic"',
  ]);
});

test('scans append to caller violations and do not clear earlier diagnostics', () => {
  const violations = ['preexisting'];
  const ctx = context(violations);
  scanForbiddenArtifactKeys([{ token: 'redacted' }], 'artifact', ctx);
  validateNoRealArtifactFixtureMarkers('fixture', 'artifact', ctx);
  assert.deepEqual(violations, [
    'preexisting',
    'artifact[0]: forbidden sensitive field "token"',
    'artifact: <root> must not contain fixture marker "fixture"',
  ]);
});

test('repeated marker scans do not leak regex state', () => {
  const violations = [];
  const ctx = context(violations);
  validateNoRealArtifactFixtureMarkers('mock', 'first', ctx);
  validateNoRealArtifactFixtureMarkers('mock', 'second', ctx);
  assert.deepEqual(violations, [
    'first: <root> must not contain fixture marker "mock"',
    'second: <root> must not contain fixture marker "mock"',
  ]);
});
