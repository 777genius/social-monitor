import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createExternalBetaJobReadiness } from './external-beta-evidence-job-readiness.mjs';

function fixture(env = {}) {
  const process = { env: { ...env } };
  return { process, ...createExternalBetaJobReadiness({
    process,
    localRuntimeEnvNames: () => new Set(['LOCAL_URL']),
    isLocalRuntimeEnvValue: value => value.startsWith('http://127.0.0.1') || value.startsWith('http://localhost'),
  }) };
}

test('reads live environment values lazily and preserves trim and optional checks', () => {
  const f = fixture({ EMPTY: '  ' });
  assert.equal(f.hasEnv('TOKEN'), false);
  f.process.env.TOKEN = ' value ';
  assert.equal(f.hasEnv('TOKEN'), true);
  assert.equal(f.hasEnv('EMPTY'), false);
  assert.deepEqual(f.missingOptionalEnvNames({ optionalEnv: ['EMPTY', 'TOKEN', 'ABSENT'] }), ['EMPTY', 'ABSENT']);
});

test('required env alternatives preserve captured-artifact exclusions and coverage', () => {
  const f = fixture({ MAIN: 'true', ALT: 'captured' });
  const job = { requiredEnv: ['MAIN', 'MISSING'], optionalEnv: ['EMPTY'], requiredEnvAlternatives:
    [{ label: 'captured', mode: 'captured_artifact', env: ['ALT'], coversEnv: ['MISSING'] }] };
  assert.deepEqual(f.missingRequiredEnv(job), []);
  assert.deepEqual(f.missingRequiredEnv(job, { allowCapturedArtifactAlternatives: false }), ['MISSING']);
  assert.deepEqual(f.requiredEnvAlternativeCoveredEnvNames({ env: ['ONE'] }), ['ONE']);
  assert.deepEqual(f.requiredEnvAlternativeCoveredEnvNames({ coversEnv: 'invalid' }), []);
  assert.deepEqual(f.jobInputEnvNames(job), ['MAIN', 'MISSING', 'EMPTY', 'ALT']);
});

test('missing-required diagnostics retain exact text and precedence', () => {
  const f = fixture();
  const job = { jobId: 'alpha', requiredEnvAlternatives: [
    { label: 'captured', mode: 'captured_artifact', env: ['ARTIFACT'], coversEnv: ['MISSING'] },
    { env: ['ONE', 'TWO'], coversEnv: ['MISSING'] },
  ] };
  assert.equal(f.formatMissingRequiredEnvViolation(job, ['MISSING']),
    'alpha: missing required env MISSING; satisfy one alternative: captured(ARTIFACT) OR unnamed_alternative(ONE+TWO)');
  assert.equal(f.formatMissingRequiredEnvViolation(job, ['MISSING'], { allowCapturedArtifactAlternatives: false }),
    'alpha: missing required env MISSING; satisfy one alternative: unnamed_alternative(ONE+TWO)');
  assert.equal(f.formatMissingRequiredEnvViolation(job, ['OTHER']), 'alpha: missing required env OTHER');
});

test('execution readiness preserves missing, invalid, and local-runtime branch priorities', () => {
  const f = fixture({ LOCAL_URL: 'http://127.0.0.1:9090' });
  const job = { mode: 'live_network', runPolicy: 'live_command' };
  assert.equal(f.jobExecutionReadiness(job, ['MISSING'], []), 'blocked_missing_required_env');
  assert.equal(f.jobExecutionReadiness(job, [], ['alpha: env UNKNOWN invalid']), 'blocked_invalid_env');
  const local = ['alpha: env LOCAL_URL points to local runtime'];
  assert.equal(f.jobExecutionReadiness(job, [], local), 'blocked_local_runtime_env');
  assert.equal(f.jobExecutionReadiness({ ...job, mode: 'local_contract' }, [], local), 'blocked_invalid_env');
  assert.equal(f.jobExecutionReadiness(job, [], [...local, 'other failure']), 'blocked_invalid_env');
});

test('execution readiness preserves manual, captured, live and local success states', () => {
  const f = fixture({ CAPTURED: '/safe/artifact.json' });
  assert.equal(f.jobExecutionReadiness({ runPolicy: 'manual_artifact_then_validator' }, [], []), 'manual_artifact_required');
  assert.equal(f.jobExecutionReadiness({ runPolicy: 'live_command', requiredEnvAlternatives:
    [{ mode: 'captured_artifact', env: ['CAPTURED'] }] }, [], []), 'live_artifact_ready_for_validation');
  assert.equal(f.jobExecutionReadiness({ runPolicy: 'live_command' }, [], []), 'live_command_executable');
  assert.equal(f.jobExecutionReadiness({ runPolicy: 'local_contract' }, [], []), 'local_contract_ready');
});

const runner = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
const oldNames = ["missingRequiredEnv","missingOptionalEnvNames","satisfiedRequiredEnvAlternatives","requiredEnvAlternativeCoveredEnvNames","jobInputEnvNames","hasEnv","jobExecutionReadiness","hasSatisfiedCapturedArtifactAlternative","hasOnlyLocalRuntimeEnvViolations","extractEnvNameFromPreflightViolation","formatMissingRequiredEnvViolation","missingCoveringAlternatives","formatRequiredEnvAlternative"];
function validateTopLevelWiring(source) {
  const ast = ts.createSourceFile('runner.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0);
  let factories = 0;
  for (const statement of ast.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const d of statement.declarationList.declarations) {
        if (ts.isCallExpression(d.initializer) && ts.isIdentifier(d.initializer.expression) &&
          d.initializer.expression.text === 'createExternalBetaJobReadiness') factories++;
      }
    }
    if (ts.isFunctionDeclaration(statement) && oldNames.includes(statement.name?.text)) {
      assert.fail('retained original implementation ' + statement.name.text);
    }
  }
  assert.equal(factories, 1, 'one active top-level factory binding');
  assert.ok(source.includes("import { createExternalBetaJobReadiness } from './lib/external-beta-evidence-job-readiness.mjs';"));
}
test('original CLI has one direct active delegation and no stale implementation', () => {
  validateTopLevelWiring(runner);
});
test('disabled, removed, duplicate and nested delegation fail original AST gate', () => {
  const call = 'createExternalBetaJobReadiness({ process, localRuntimeEnvNames, isLocalRuntimeEnvValue })';
  assert.equal(runner.split(call).length, 2);
  for (const altered of [
    runner.replace(call, 'undefined'),
    runner.replace(call, '/* disabled */ undefined'),
    runner.replace(call, 'true ? undefined : ' + call),
    runner.replace(call, call + ', ' + call),
  ]) assert.throws(() => validateTopLevelWiring(altered));
});
