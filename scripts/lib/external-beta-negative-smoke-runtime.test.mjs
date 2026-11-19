import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  createExternalBetaNegativeSmokeRuntime,
  childProcessErrorOutput,
  smokeOutputSnippet,
} from './external-beta-negative-smoke-runtime.mjs';

test('negative smoke selection preserves live strict/representative membership', () => {
  const strict = new Set(['a', 'b']);
  const representative = new Set(['a']);
  const { negativeSmokeOptions, shouldRunNegativeSmoke } = createExternalBetaNegativeSmokeRuntime({
    strictSemanticNegativeSmokeLabels: strict,
    representativeSemanticNegativeSmokeLabels: representative,
  });
  assert.deepEqual(negativeSmokeOptions('plain'), { contractSmokeArtifactOnly: true });
  assert.deepEqual(negativeSmokeOptions('a'), { contractSmokeArtifactOnly: false });
  assert.equal(shouldRunNegativeSmoke('plain'), true);
  assert.equal(shouldRunNegativeSmoke('a'), true);
  assert.equal(shouldRunNegativeSmoke('b'), false);
  representative.add('b');
  assert.equal(shouldRunNegativeSmoke('b'), true);
  strict.delete('b');
  assert.deepEqual(negativeSmokeOptions('b'), { contractSmokeArtifactOnly: true });
});

test('error diagnostics preserve Buffer decoding, order, and empty filtering', () => {
  const error = { stdout: Buffer.from('out'), stderr: ' err ',
    output: [null, Buffer.from('tail'), '', undefined], message: 'message' };
  assert.equal(childProcessErrorOutput(error), 'out\n err \ntail\nmessage');
  assert.equal(childProcessErrorOutput({ message: '' }), '');
  assert.equal(childProcessErrorOutput({ message: 0, output: [] }), '0');
});

test('smoke snippet preserves trimmed last eight nonblank lines', () => {
  assert.equal(smokeOutputSnippet('  first  \n\n second \n '), 'first | second');
  assert.equal(smokeOutputSnippet(Array.from({ length: 10 }, (_, i) => ' ' + i + ' ').join('\n')),
    '2 | 3 | 4 | 5 | 6 | 7 | 8 | 9');
  assert.equal(smokeOutputSnippet(null), 'null');
});

test('runner delegates negative-smoke helpers instead of duplicating bodies', () => {
  const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  assert.match(source, /from ['"]\.\/lib\/external-beta-negative-smoke-runtime\.mjs['"]/);
  assert.match(source, /createExternalBetaNegativeSmokeRuntime\(\{/);
  for (const name of ['negativeSmokeOptions', 'shouldRunNegativeSmoke',
    'childProcessErrorOutput', 'smokeOutputSnippet']) {
    assert.doesNotMatch(source, new RegExp('function\\s+' + name + '\\s*\\('));
  }
  const packageScripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
  for (const command of ['check:architecture', 'check:external-beta-evidence-runner']) {
    assert.match(packageScripts[command], /scripts\/lib\/external-beta-negative-smoke-runtime\.test\.mjs/);
  }
});
