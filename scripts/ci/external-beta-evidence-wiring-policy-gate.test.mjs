import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// The static-quality test discovery must exercise the pure policy cases.
import '../lib/external-beta-evidence-wiring-policy.test.mjs';

const source = readFileSync(new URL('../check-external-beta-evidence-runner.mjs', import.meta.url), 'utf8');

function assertActiveDelegation(candidate) {
  const active = candidate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(active, /^validateWiring\(\{$/m, 'required active wiring policy call');
}

function assertBehavior(candidate) {
  const begin = 'validateEnvExample();';
  const finish = 'validateNoSensitiveLiterals();';
  const start = candidate.indexOf(begin);
  const end = candidate.indexOf(finish, start + begin.length);
  assert.ok(start >= 0 && end > start, 'checker post-job validation boundary');
  const events = [];
  const context = {
    contract: {}, contractPath: 'contract', externalReadiness: {}, externalReadinessPath: 'readiness',
    packageScripts: {}, packagePath: 'package', backendScripts: new Set(), backendSafePath: 'backend',
    baselineScripts: new Set(), baselineArtifacts: new Set(), baselinePath: 'baseline',
    violations: [], scriptNameFromCommand: () => null,
  };
  runInNewContext(candidate.slice(start, end), {
    ...context,
    validateEnvExample: () => events.push('env'),
    validateWiring: provided => {
      assert.equal(provided.contract, context.contract);
      assert.equal(provided.violations, context.violations);
      events.push('wiring');
    },
  }, { timeout: 1000 });
  assert.deepEqual(events, ['env', 'wiring']);
}

test('real runner checker executes extracted wiring validator in original order', () => {
  assert.match(source, /from '\.\/lib\/external-beta-evidence-wiring-policy\.mjs'/);
  assert.doesNotMatch(source, /function validateWiring\(/);
  assertActiveDelegation(source);
  assertBehavior(source);
});

test('removing and commenting out wiring delegation fails static gate', () => {
  assertActiveDelegation(source);
  const removed = source.replace(/^validateWiring\(\{$/m, 'void noOp({');
  assert.throws(() => assertActiveDelegation(removed), /required active wiring policy call/);
  const commented = source.replace(/^validateWiring\(\{$/m, '// validateWiring({');
  assert.throws(() => assertActiveDelegation(commented), /required active wiring policy call/);
});

test('wiring delegation cannot disconnect the shared violation sink', () => {
  const mutated = source.replace(/^  violations, scriptNameFromCommand,$/m,
    '  violations: [], scriptNameFromCommand,');
  assert.notEqual(mutated, source, 'expected to mutate original validation call');
  assertActiveDelegation(mutated);
  assert.throws(() => assertBehavior(mutated), { code: 'ERR_ASSERTION' });
});

test('unreachable wiring validator fails actual behavioral delegation', () => {
  const mutated = source.replace(/^validateWiring\(\{$/m, 'if (false) {\nvalidateWiring({')
    .replace(/^ {2}violations, scriptNameFromCommand,\n\}\);$/m,
      '  violations, scriptNameFromCommand,\n});\n}');
  assertActiveDelegation(mutated);
  assert.throws(() => assertBehavior(mutated), { code: 'ERR_ASSERTION' });
});
