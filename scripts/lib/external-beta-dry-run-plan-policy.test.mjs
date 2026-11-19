import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createExternalBetaDryRunPlanPolicy } from './external-beta-dry-run-plan-policy.mjs';

function fixture() {
  const runner = {
    runnerId: 'test-runner',
    jsonPlanCommand: 'npm run plan-json',
    handoffCommand: 'npm run handoff',
    handoffJsonCommand: 'npm run handoff-json',
    summaryCommand: 'npm run summary',
    preflightCommand: 'npm run preflight',
    artifactValidationCommand: 'npm run artifact-validation',
    currentPackageCommand: 'npm run current',
  };
  const dryRun = {
    schemaVersion: 1, scope: 'backend-only', frontendPolicy: 'deferred_contract_only',
    defaultMode: 'plan_only', notEvidence: true, doesNotUnblockExternalBeta: true,
    sourceRunnerContract: 'exists', sourceReadinessContract: 'exists', envExample: 'exists',
    planJsonCommand: runner.jsonPlanCommand, handoffCommand: runner.handoffCommand,
    handoffJsonCommand: runner.handoffJsonCommand, summaryCommand: runner.summaryCommand,
    preflightCommand: runner.preflightCommand,
    artifactValidationCommand: runner.artifactValidationCommand,
    currentPackageCommand: runner.currentPackageCommand,
    liveExecutionTemplate: 'EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live node runner --execute',
    expectedPlanCountsWithoutCredentials: { jobCount: 1 },
    requiredJobIds: ['local'], requiredMissingEnvWithoutCredentials: [],
    requiredReadinessStatesWithoutCredentials: ['local_contract_ready'],
  };
  const plan = {
    runnerId: runner.runnerId, mode: 'plan_only', jobCount: 1, uniqueMissingEnv: [],
    readinessCounts: { local_contract_ready: 1 },
    jobs: [{
      jobId: 'local', blocksExternalBeta: true, owner: 'source-owner',
      exitCondition: 'validated', validationCommands: ['npm run check:contract'],
      runPolicy: 'local_contract', executionReadiness: 'local_contract_ready',
    }],
  };
  const violations = [];
  function assertSameSet(actual, expected, label) {
    const actualSorted = [...new Set(actual)].sort();
    const expectedSorted = [...new Set(expected)].sort();
    if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
      violations.push(label + ': expected [' + expectedSorted.join(', ') +
        '], got [' + actualSorted.join(', ') + ']');
    }
  }
  const checks = createExternalBetaDryRunPlanPolicy({
    dryRun, runner, plan, dryRunPath: 'dry-run.json', runnerPath: 'runner.json',
    existsSync: (path) => path === 'exists', assertSameSet, violations,
  });
  return { dryRun, runner, plan, violations, ...checks };
}

test('valid clean-env dry-run contract and plan preserve zero diagnostics', () => {
  const f = fixture();
  f.validateDryRunContract();
  f.validatePlanShape();
  assert.deepEqual(f.violations, []);
});

test('contract errors retain legacy ordering and no-live-execution policy', () => {
  const f = fixture();
  f.dryRun.scope = 'frontend-enabled';
  f.dryRun.sourceReadinessContract = '/not-present';
  f.dryRun.liveExecutionTemplate = 'unsafe';
  f.validateDryRunContract();
  assert.deepEqual(f.violations, [
    'dry-run.json: scope must be backend-only',
    'dry-run.json: referenced file must exist: /not-present',
    'dry-run.json: liveExecutionTemplate must include explicit live confirmation',
    'dry-run.json: liveExecutionTemplate must include --execute',
  ]);
});

test('plan gates remain fail-closed for live jobs without credentials', () => {
  const f = fixture();
  f.plan.jobs[0].runPolicy = 'live_command';
  f.plan.jobs[0].executionReadiness = 'local_contract_ready';
  f.plan.jobs[0].runnerCommand = undefined;
  f.validatePlanShape();
  assert.deepEqual(f.violations, [
    'dry-run.json: local external evidence job must stay blocked without credentials',
    'dry-run.json: local live command job must expose runnerCommand',
  ]);
});

test('policy uses live contract objects instead of freezing state at creation', () => {
  const f = fixture();
  f.dryRun.defaultMode = 'execute';
  f.plan.mode = 'execute';
  f.plan.uniqueMissingEnv.push('SECRET_REFERENCE');
  f.validateDryRunContract();
  f.validatePlanShape();
  assert.ok(f.violations.includes('dry-run.json: defaultMode must be plan_only'));
  assert.ok(f.violations.includes('dry-run.json: clean-env plan must stay plan_only'));
  assert.ok(f.violations.some((value) => value.includes('requiredMissingEnvWithoutCredentials')));
});

test('runner delegates to extracted policy without stale duplicate definitions', () => {
  const runnerSource = readFileSync(
    new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url), 'utf8');
  assert.match(runnerSource,
    /import \{ createExternalBetaDryRunPlanPolicy \} from '\.\/lib\/external-beta-dry-run-plan-policy\.mjs'/);
  assert.match(runnerSource, /createExternalBetaDryRunPlanPolicy\(\{/);
  assert.doesNotMatch(runnerSource, /^function validate(DryRunContract|PlanShape)\(/m);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['check:architecture'],
    /scripts\/lib\/external-beta-dry-run-plan-policy\.test\.mjs/);
});
