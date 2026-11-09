import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import '../lib/external-beta-artifact-negative-smoke-scenarios.test.mjs';

const checker = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const moduleImport = /from '\.\/lib\/external-beta-artifact-negative-smoke-scenarios\.mjs'/;
const delegates = [
  ['validateRunnerNegativeReleaseDeployArtifactSmokes', 'releaseDeployNegativeSmokeScenarios'],
  ['validateRunnerNegativeRedditArtifactSmokes', 'redditArtifactNegativeSmokeScenarios'],
];

function assertActiveDelegation(source, functionName, factoryName) {
  const clean = source.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(clean, moduleImport);
  const marker = 'function ' + functionName + '() {\n';
  const start = clean.indexOf(marker);
  const bodyStart = start + marker.length;
  const functionEnd = clean.indexOf('\n}', bodyStart);
  assert.ok(start >= 0 && functionEnd > bodyStart, 'original smoke executor must remain');
  const body = clean.slice(bodyStart, functionEnd);
  const loop = /^[ \t]*for\s*\(\s*const\s+scenario\s+of\s+scenarios\s*\)\s*\{/m.exec(body);
  assert.ok(loop, 'original scenario loop must remain');
  const setup = body.slice(0, loop.index);
  const statement = 'const scenarios = ' + factoryName + '();';
  assert.ok(setup.includes(statement), 'original loop must bind actual factory output');
  let calls = 0;
  const sentinel = [];
  const value = runInNewContext(setup + '\nscenarios', {
    [factoryName]: () => { calls++; return sentinel; },
  }, { timeout: 1000 });
  assert.strictEqual(value, sentinel);
  assert.equal(calls, 1);
}

for (const [functionName, factoryName] of delegates) {
  const statement = 'const scenarios = ' + factoryName + '();';

  test(functionName + ' actively executes original negative-artifact factory', () => {
    assertActiveDelegation(checker, functionName, factoryName);
  });

  test(functionName + ' rejects absent or commented-out factory calls', () => {
    assert.throws(() => assertActiveDelegation(checker.replace(statement, ''), functionName, factoryName));
    assert.throws(() => assertActiveDelegation(checker.replace(statement, '// ' + statement), functionName, factoryName));
  });

  test(functionName + ' rejects nested and unreachable substitute arrays', () => {
    assert.throws(() => assertActiveDelegation(checker.replace(statement, 'if (false) { ' + statement + ' }'), functionName, factoryName));
    assert.throws(() => assertActiveDelegation(checker.replace(statement, '{ ' + statement + ' }\n  const scenarios = [];'), functionName, factoryName));
    assert.throws(() => assertActiveDelegation(checker.replace(statement, 'const scenarios = [];'), functionName, factoryName));
  });

  test(functionName + ' accepts formatter-only scenario loop changes', () => {
    const original = statement + '\n\n  for (const scenario of scenarios) {';
    assert.ok(checker.includes(original), 'expected original loop fixture');
    assertActiveDelegation(checker.replace(original, statement + '\n    for( const scenario of scenarios ) {'), functionName, factoryName);
  });

  test(functionName + ' rejects a missing scenario loop', () => {
    const original = statement + '\n\n  for (const scenario of scenarios) {';
    assert.ok(checker.includes(original), 'expected original loop fixture');
    assert.throws(() => assertActiveDelegation(checker.replace(original, statement + '\n    if (false) {'), functionName, factoryName));
  });

  test(functionName + ' handles CRLF source without accepting disabled factory calls', () => {
    const crlf = checker.replace(/\r?\n/g, '\r\n');
    assertActiveDelegation(crlf, functionName, factoryName);
    assert.throws(() => assertActiveDelegation(crlf.replace(statement, '// ' + statement), functionName, factoryName));
  });
}
