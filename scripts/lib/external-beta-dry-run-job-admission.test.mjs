import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dryRunCliFixture } from './external-beta-dry-run-cli-fixture.mjs';

const prefix = 'ops/release/external-beta-evidence-dry-run.json';

function addLocalJob(f, jobId) {
  const job = {
    jobId, blocksExternalBeta: true, owner: 'fixture-owner', exitCondition: 'validated',
    validationCommands: ['npm run check:fixture'], runPolicy: 'local_contract',
    executionReadiness: 'local_contract_ready',
  };
  f.runner.jobs.push({ ...job });
  f.dryRun.requiredJobIds.push(jobId);
  f.plan.jobs.push(job);
  f.plan.jobCount = f.plan.jobs.length;
  f.plan.localContractJobCount = f.plan.jobs.length;
  f.plan.contractClosurePercent = 100;
  f.plan.readinessCounts = { local_contract_ready: f.plan.jobs.length };
  f.dryRun.expectedPlanCountsWithoutCredentials = { jobCount: f.plan.jobs.length };
  f.dryRun.requiredReadinessStatesWithoutCredentials = ['local_contract_ready'];
  Object.assign(f.handoff.readiness, {
    totalJobs: f.plan.jobCount, localContractJobs: f.plan.localContractJobCount,
    contractClosurePercent: 100,
  });
  f.handoff.jobs.push({
    jobId, executionReadiness: job.executionReadiness, operatorAction: 'Run the fixture check',
    outputArtifacts: [{ env: null, location: 'fixture.json' }],
    requiredInputs: [], requiredEnv: [], optionalInputs: [], optionalEnv: [],
  });
}

function fixture(t) {
  const f = dryRunCliFixture();
  t.after(() => f.cleanup());
  addLocalJob(f, 'local-contract');
  return f;
}

function expectViolations(f, expected) {
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.deepStrictEqual(result.stderr.trimEnd().split('\n'), expected);
}

test('real CLI accepts unique jobs and matches handoff by identity rather than array order', (t) => {
  const f = fixture(t);
  addLocalJob(f, 'another-local-contract');
  f.handoff.jobs.reverse();
  const result = f.run();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'External beta evidence dry-run package OK\n');
});

test('real CLI rejects missing, non-string and blank operator actions', async (t) => {
  for (const [name, value] of [
    ['missing', undefined], ['null', null], ['number', 42], ['object', {}],
    ['array', ['run fixture']], ['empty', ''], ['whitespace', ' \t\n '],
  ]) {
    await t.test(name, (t) => {
      const f = fixture(t);
      f.handoff.jobs[0].operatorAction = value;
      expectViolations(f, [`${prefix}: JSON handoff local-contract must include operatorAction`]);
    });
  }
});

test('real CLI rejects duplicate plan IDs even when declared job counts agree', (t) => {
  const f = fixture(t);
  f.plan.jobs.push({ ...f.plan.jobs[0] });
  f.plan.jobCount = 2;
  f.plan.localContractJobCount = 2;
  f.plan.readinessCounts.local_contract_ready = 2;
  f.dryRun.expectedPlanCountsWithoutCredentials.jobCount = 2;
  f.handoff.readiness.totalJobs = 2;
  f.handoff.readiness.localContractJobs = 2;
  expectViolations(f, [`${prefix}: plan jobs: duplicate jobId "local-contract"`]);
});

test('real CLI rejects duplicate handoff IDs before a later entry can hide the first', async (t) => {
  for (const [name, firstEntry] of [
    ['identical entries', {}],
    ['hidden invalid entry', { executionReadiness: 'executable_live', operatorAction: '' }],
  ]) {
    await t.test(name, (t) => {
      const f = fixture(t);
      f.handoff.jobs.unshift({ ...f.handoff.jobs[0], ...firstEntry });
      expectViolations(f, [`${prefix}: JSON handoff jobs: duplicate jobId "local-contract"`]);
    });
  }
});

test('real CLI preserves contract, plan and handoff diagnostic order with duplicate admission', (t) => {
  const f = fixture(t);
  f.dryRun.defaultMode = 'execute';
  f.plan.mode = 'execute';
  f.plan.jobs.push({ ...f.plan.jobs[0] });
  f.handoff.safety.envValuePolicy = 'commit_values';
  f.handoff.jobs.push({ ...f.handoff.jobs[0], operatorAction: null });
  expectViolations(f, [
    `${prefix}: defaultMode must be plan_only`,
    `${prefix}: clean-env plan must stay plan_only`,
    `${prefix}: plan jobs: duplicate jobId "local-contract"`,
    `${prefix}: JSON handoff safety.envValuePolicy must be names_only`,
    `${prefix}: JSON handoff jobs: duplicate jobId "local-contract"`,
    `${prefix}: JSON handoff local-contract must include operatorAction`,
  ]);
});
