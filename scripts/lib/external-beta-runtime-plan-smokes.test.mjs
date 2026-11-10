import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createExternalBetaRuntimePlanSmokes } from './external-beta-runtime-plan-smokes.mjs';

const localPlan = {
  jobs: [{ executionReadiness: 'blocked_local_runtime_env' }],
  blockedLocalRuntimeEnvJobCount: 1,
  readinessCounts: { blocked_local_runtime_env: 1 },
  blockedInvalidInputJobCount: 0,
};
const bundlePlan = {
  jobs: [{ executionReadiness: 'manual_artifact_required', missingEnv: [] }],
  blockedMissingRequiredEnvJobCount: 0,
  blockedInvalidInputJobCount: 0,
  blockedLocalRuntimeEnvJobCount: 0,
};
function harness({ type = 'local', planOverride, commandOverride, handoffOutput } = {}) {
  const calls = [], violations = [], writes = [], modes = [], cleanup = [];
  const smokes = createExternalBetaRuntimePlanSmokes({
    contract: { runnerFile: 'fixture-runner.mjs' }, violations,
    execFileSync(binary, args, options) {
      calls.push({ binary, args, options });
      if (commandOverride) return commandOverride(binary, args, options);
      if (args.includes('--plan')) {
        const job = args.at(-1);
        const plan = JSON.parse(JSON.stringify(type === 'local' ? localPlan : bundlePlan));
        return JSON.stringify(planOverride ? planOverride(job, plan) : plan);
      }
      return handoffOutput ?? 'BACKEND_STAGING_EVIDENCE_BUNDLE_PATH covers API_BASE_URL';
    },
    runnerSmokeTimeoutMs: 30_000,
    mkdtempSync: (prefix) => prefix + 'test',
    tmpdir: () => '/tmp-fixture',
    join: (...parts) => parts.join('/'),
    writeFileSync: (...args) => writes.push(args),
    chmodSync: (...args) => modes.push(args),
    rmSync: (...args) => cleanup.push(args),
    durableBackendE2ePreflightEnv: (dir, env) => ({ ...env, FIXTURE_DIRECTORY: dir }),
    childProcessErrorOutput: (error) => 'redacted:' + error.message,
    smokeOutputSnippet: (output) => String(output).slice(0, 120),
  });
  return { calls, violations, writes, modes, cleanup, smokes };
}
function assertExecutionContract(calls) {
  for (const { binary, args, options } of calls) {
    assert.equal(binary, process.execPath);
    assert.equal(args[0], 'fixture-runner.mjs');
    assert.equal(options.timeout, 30_000);
    assert.equal(options.encoding, 'utf8');
    assert.equal(options.stdio, 'pipe');
    assert.equal(options.env.PATH, process.env.PATH ?? '');
    assert.equal(Object.hasOwn(options.env, 'HOME'), false);
  }
}
test('local runtime evidence retains plan and handoff classifications', () => {
  const h = harness();
  h.smokes.validateRunnerLocalRuntimePlanSmoke();
  assert.deepEqual(h.violations, []);
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[0].args, ['fixture-runner.mjs', '--plan', '--json', '--job', 'durable-backend-e2e-loop']);
  assert.deepEqual(h.calls[1].args, ['fixture-runner.mjs', '--handoff', '--job', 'durable-backend-e2e-loop']);
  assert.equal(h.calls[0].options.env.API_BASE_URL, 'http://127.0.0.1:3000');
  assert.equal(h.cleanup.length, 1);
  assertExecutionContract(h.calls);
});
test('local runtime negative classifications are not silently accepted', () => {
  const h = harness({ planOverride: (_job, plan) => ({
    ...plan, jobs: [{ executionReadiness: 'ready' }],
    blockedLocalRuntimeEnvJobCount: 0, blockedInvalidInputJobCount: 1,
  }) });
  h.smokes.validateRunnerLocalRuntimePlanSmoke();
  assert.ok(h.violations.some((x) => x.includes('blocked_local_runtime_env')));
  assert.ok(h.violations.some((x) => x.includes('must not count local runtime URLs')));
  assert.equal(h.cleanup.length, 1);
});
test('invalid JSON plan produces sanitized diagnostics and guaranteed cleanup', () => {
  const h = harness({ commandOverride: () => 'not-json' });
  h.smokes.validateRunnerLocalRuntimePlanSmoke();
  assert.ok(h.violations.some((x) => x.includes('redacted:')));
  assert.equal(h.calls.length, 1);
  assert.equal(h.cleanup.length, 1);
});
test('Docker evidence alternatives cover five jobs, restrict files and emit handoff', () => {
  const h = harness({ type: 'bundle' });
  h.smokes.validateRunnerDockerBundleAlternativeSmoke();
  assert.deepEqual(h.violations, []);
  assert.deepEqual(h.calls.map(({ args }) => args.at(-1)), [
    'durable-runtime-staging-proof', 'rabbitmq-staging-reliability-drill',
    'postgres-restore-migration-drill', 'durable-backend-e2e-loop',
    'release-deploy-smoke', 'durable-backend-e2e-loop',
  ]);
  assert.ok(h.calls.slice(0, 5).every(({ options }) => options.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH));
  assert.equal(JSON.parse(h.writes[0][1]).redaction.secretsIncluded, false);
  assert.equal(h.modes[0][1], 0o600);
  assert.equal(h.cleanup.length, 1);
  assertExecutionContract(h.calls);
});
test('Docker plan rejects wrong readiness, env coverage and counters', () => {
  const h = harness({ type: 'bundle', planOverride: (_job, plan) => ({
    ...plan, jobs: [{ executionReadiness: 'ready', missingEnv: ['API_BASE_URL', 'RABBITMQ_URL', 'DATABASE_URL'] }],
    blockedMissingRequiredEnvJobCount: 1, blockedInvalidInputJobCount: 1,
    blockedLocalRuntimeEnvJobCount: 1,
  }) });
  h.smokes.validateRunnerDockerBundleAlternativeSmoke();
  for (const required of ['manual_artifact_required', 'must cover', 'must not count missing required env', 'must not count invalid input', 'must not count local runtime env']) {
    assert.ok(h.violations.some((x) => x.includes(required)), required);
  }
  assert.equal(h.cleanup.length, 1);
});
test('Docker handoff refuses missing explanation even when all plans pass', () => {
  const h = harness({ type: 'bundle', handoffOutput: 'missing coverage' });
  h.smokes.validateRunnerDockerBundleAlternativeSmoke();
  assert.ok(h.violations.some((x) => x.includes('must explain covered API_BASE_URL')));
  assert.equal(h.cleanup.length, 1);
});
test('runner spawn failure is diagnostic but cannot skip cleanup', () => {
  const h = harness({ type: 'bundle', commandOverride: () => {
    const e = new Error('child rejected'); e.status = 4; throw e;
  } });
  h.smokes.validateRunnerDockerBundleAlternativeSmoke();
  assert.ok(h.violations.some((x) => x.includes('redacted:child rejected')));
  assert.equal(h.cleanup.length, 1);
});
test('production checker has exactly one adapter binding and no legacy definitions', () => {
  const source = readFileSync('scripts/check-external-beta-evidence-runner.mjs', 'utf8');
  assert.equal((source.match(/createExternalBetaRuntimePlanSmokes\(/g) ?? []).length, 1);
  assert.equal((source.match(/validateRunnerLocalRuntimePlanSmoke\(\);/g) ?? []).length, 1);
  assert.equal((source.match(/validateRunnerDockerBundleAlternativeSmoke\(\);/g) ?? []).length, 1);
  assert.equal(source.includes('function validateRunnerLocalRuntimePlanSmoke('), false);
  assert.equal(source.includes('function runRunnerJsonPlanSmoke('), false);
});
