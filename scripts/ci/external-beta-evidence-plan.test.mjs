import assert from 'node:assert/strict';
import test from 'node:test';
import { buildExternalBetaPlan } from '../lib/external-beta-evidence-plan.mjs';

function job(jobId, runPolicy, extra = {}) {
  return {
    jobId, evidenceGroupId: 'group-' + jobId, mode: 'provider', runPolicy,
    owner: 'test-owner', blocksExternalBeta: false,
    runnerCommand: null, runnerDescription: 'test runner', operatorAction: 'inspect',
    validationCommands: ['test-validator'], requiredEnv: [], optionalEnv: [],
    outputArtifacts: [], exitCondition: 'validated', ...extra,
  };
}

function dependencies(overrides = {}) {
  return {
    runnerId: 'test-runner', mode: 'plan_only',
    duplicateEvidencePathViolationsByJob: () => new Map(),
    missingRequiredEnv: () => [],
    missingOptionalEnvNames: () => [],
    jobPreflightViolations: () => [],
    jobExecutionReadiness: (item, missing, violations) =>
      missing.length ? 'blocked_missing_required_env'
        : violations.length ? 'blocked_invalid_env'
          : item.runPolicy === 'local_contract' ? 'local_contract_ready'
            : item.runPolicy === 'manual_artifact_then_validator' ? 'manual_artifact_required'
              : 'live_command_executable',
    percent: (a, b) => b <= 0 ? 0 : Math.round(a / b * 100),
    ...overrides,
  };
}

test('empty plan preserves original count and zero-denominator behavior', () => {
  const result = buildExternalBetaPlan([], dependencies());
  assert.equal(result.runnerId, 'test-runner');
  assert.equal(result.mode, 'plan_only');
  assert.deepEqual(result.jobs, []);
  assert.equal(result.jobCount, 0);
  assert.equal(result.contractClosurePercent, 0);
  assert.equal(result.externalEvidenceEnvReadinessPercent, 0);
  assert.deepEqual(result.readinessCounts, {});
});

test('aggregates missing required/optional env, readiness, and blocker counts', () => {
  const items = [
    job('local', 'local_contract'),
    job('live', 'live_command', { blocksExternalBeta: true, requiredEnv: ['LIVE_TOKEN'] }),
    job('manual', 'manual_artifact_then_validator'),
  ];
  const forwarded = [];
  const result = buildExternalBetaPlan(items, dependencies({
    missingRequiredEnv: item => item.jobId === 'live' ? ['LIVE_TOKEN'] : [],
    missingOptionalEnvNames: item => item.jobId === 'local' || item.jobId === 'live' ? ['OPTIONAL'] : [],
    jobPreflightViolations: (item, names) => {
      forwarded.push([item.jobId, [...names]]);
      return [];
    },
  }));
  assert.deepEqual(forwarded, [['local', []], ['live', ['LIVE_TOKEN']], ['manual', []]]);
  assert.equal(result.jobCount, 3);
  assert.equal(result.localContractJobCount, 1);
  assert.equal(result.liveCommandJobCount, 1);
  assert.equal(result.manualArtifactJobCount, 1);
  assert.equal(result.externalBlockerJobCount, 1);
  assert.equal(result.executableLiveJobCount, 0);
  assert.equal(result.manualArtifactReadyForValidationJobCount, 1);
  assert.equal(result.blockedMissingRequiredEnvJobCount, 1);
  assert.equal(result.missingEnvCount, 1);
  assert.equal(result.missingOptionalEnvCount, 2);
  assert.deepEqual(result.uniqueMissingEnv, ['LIVE_TOKEN']);
  assert.deepEqual(result.uniqueMissingOptionalEnv, ['OPTIONAL']);
  assert.equal(result.contractClosurePercent, 33);
  assert.equal(result.externalEvidenceEnvReadinessPercent, 50);
  assert.deepEqual(result.jobs[1].missingEnv, ['LIVE_TOKEN']);
  assert.equal(result.jobs[1].runnerDescription, 'test runner');
});

test('duplicate-path preflight diagnostics reach readiness without suppression', () => {
  const item = job('live', 'live_command', { outputArtifacts: [{ env: 'OUTPUT', format: 'json' }] });
  const seen = [];
  const result = buildExternalBetaPlan([item], dependencies({
    mode: 'validate_artifacts',
    duplicateEvidencePathViolationsByJob: () => new Map([['live', ['duplicate output artifact']]]),
    jobPreflightViolations: () => ['unsafe evidence path'],
    jobExecutionReadiness: (_, missing, violations) => {
      seen.push([missing, violations]);
      return violations.length ? 'blocked_invalid_env' : 'live_command_executable';
    },
  }));
  assert.deepEqual(seen, [[[], ['unsafe evidence path', 'duplicate output artifact']]]);
  assert.deepEqual(result.jobs[0].preflightViolations, ['unsafe evidence path', 'duplicate output artifact']);
  assert.equal(result.blockedInvalidInputJobCount, 1);
  assert.equal(result.executableLiveJobCount, 0);
  assert.equal(result.externalEvidenceEnvReadinessPercent, 0);
  assert.equal(result.mode, 'validate_artifacts');
});

test('all original live and local-runtime readiness counters remain distinct', () => {
  const items = [
    job('live-ok', 'live_command'),
    job('live-artifact', 'live_command'),
    job('local-env', 'live_command'),
    job('manual', 'manual_artifact_then_validator'),
  ];
  const readiness = new Map([
    ['live-ok', 'live_command_executable'],
    ['live-artifact', 'live_artifact_ready_for_validation'],
    ['local-env', 'blocked_local_runtime_env'],
    ['manual', 'manual_artifact_required'],
  ]);
  const result = buildExternalBetaPlan(items, dependencies({
    jobExecutionReadiness: item => readiness.get(item.jobId),
  }));
  assert.equal(result.executableLiveJobCount, 1);
  assert.equal(result.liveArtifactReadyForValidationJobCount, 1);
  assert.equal(result.manualArtifactReadyForValidationJobCount, 1);
  assert.equal(result.blockedLocalRuntimeEnvJobCount, 1);
  assert.equal(result.externalEvidenceEnvReadinessPercent, 75);
  assert.equal(result.blockedInvalidInputJobCount, 0);
  assert.deepEqual(result.readinessCounts, Object.fromEntries([...readiness.values()].map(v => [v, 1])));
});

test('default readiness policy forwards preflight violations and prioritizes missing env', () => {
  const items = [job('invalid', 'live_command'), job('missing', 'live_command')];
  const result = buildExternalBetaPlan(items, dependencies({
    missingRequiredEnv: item => item.jobId === 'missing' ? ['LIVE_TOKEN'] : [],
    jobPreflightViolations: () => ['unsafe evidence path'],
  }));
  assert.deepEqual(result.jobs.map(item => item.executionReadiness), [
    'blocked_invalid_env', 'blocked_missing_required_env',
  ]);
  assert.equal(result.blockedInvalidInputJobCount, 1);
  assert.equal(result.blockedMissingRequiredEnvJobCount, 1);
  assert.equal(result.executableLiveJobCount, 0);
  assert.equal(result.externalEvidenceEnvReadinessPercent, 0);
});
