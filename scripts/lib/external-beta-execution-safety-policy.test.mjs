import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateSafety, validateArtifactFreshnessPolicy } from './external-beta-execution-safety-policy.mjs';

const originalContractPath = 'ops/release/external-beta-evidence-runner.json';
const originalContract = JSON.parse(readFileSync(new URL('../../ops/release/external-beta-evidence-runner.json', import.meta.url), 'utf8'));
const forbiddenFragments = ['frontend', 'mobile', 'flutter', 'agent-runtime', 'claude-hooks'];

function fixture() {
  return {
    contract: structuredClone(originalContract),
    contractPath: originalContractPath,
    forbiddenFragments,
    violations: [],
  };
}

function check(validator, mutate) {
  const context = fixture();
  mutate(context.contract);
  validator(context);
  return context.violations;
}

function rejects(validator, mutate, diagnostic) {
  assert.ok(check(validator, mutate).includes(originalContractPath + ': ' + diagnostic), diagnostic);
}

test('tracked original execution-safety and freshness contracts preserve acceptance', () => {
  const context = fixture();
  validateSafety(context);
  validateArtifactFreshnessPolicy(context);
  assert.deepEqual(context.violations, []);
});

test('missing execution safety never passes', () => {
  rejects(validateSafety, contract => { contract.executionSafety = null; }, 'executionSafety is required');
});
test('live action retains mandatory --execute', () => {
  rejects(validateSafety, contract => {
    contract.executionSafety.liveExecutionRequires =
      contract.executionSafety.liveExecutionRequires.filter(value => value !== '--execute');
  }, 'executionSafety.liveExecutionRequires must include --execute');
});
test('live action retains explicit confirmation value', () => {
  rejects(validateSafety, contract => {
    contract.executionSafety.liveExecutionRequires =
      contract.executionSafety.liveExecutionRequires.filter(value => value !== 'EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live');
  }, 'executionSafety.liveExecutionRequires must include confirmation env');
});
test('default action may not silently become live', () => {
  rejects(validateSafety, contract => { contract.executionSafety.defaultActionWithoutExecute = 'execute'; },
    'executionSafety.defaultActionWithoutExecute must be print_plan_only');
});
test('manual jobs cannot become executable without evidence', () => {
  rejects(validateSafety, contract => { contract.executionSafety.manualArtifactJobsFailExecute = false; },
    'executionSafety.manualArtifactJobsFailExecute must be true');
});
test('preflight must validate critical environment values', () => {
  rejects(validateSafety, contract => { contract.executionSafety.preflightRequiresEnvValueValidation = false; },
    'executionSafety.preflightRequiresEnvValueValidation must be true');
});
test('output artifacts must remain JSON', () => {
  rejects(validateSafety, contract => { contract.executionSafety.outputArtifactPathEnvRequiresJsonExtension = false; },
    'executionSafety.outputArtifactPathEnvRequiresJsonExtension must be true');
});
test('evidence paths retain private-file permission checks', () => {
  rejects(validateSafety, contract => { contract.executionSafety.evidencePathEnvRequiresPrivateFileMode = false; },
    'executionSafety.evidencePathEnvRequiresPrivateFileMode must be true');
});
test('evidence paths retain a positive size bound', () => {
  rejects(validateSafety, contract => { contract.executionSafety.evidencePathEnvMaxBytes = 0; },
    'executionSafety.evidencePathEnvMaxBytes must be positive');
});
test('tracked environment file injection remains forbidden', () => {
  rejects(validateSafety, contract => { contract.executionSafety.envFileForbidsGitTrackedPath = false; },
    'executionSafety.envFileForbidsGitTrackedPath must be true');
});
test('env-file conflicts remain fail-closed', () => {
  rejects(validateSafety, contract => { contract.executionSafety.envFileConflictPolicy = 'override'; },
    'executionSafety.envFileConflictPolicy must be fail_on_conflicting_values');
});
test('forbidden frontend target fragments remain protected', () => {
  rejects(validateSafety, contract => {
    contract.executionSafety.forbiddenTargets =
      contract.executionSafety.forbiddenTargets.filter(value => value !== 'frontend');
  }, 'executionSafety.forbiddenTargets must include frontend');
});

test('missing artifact freshness policy never passes', () => {
  rejects(validateArtifactFreshnessPolicy, contract => { contract.artifactFreshness = null; },
    'artifactFreshness is required');
});
test('artifact freshness retains positive age limit', () => {
  rejects(validateArtifactFreshnessPolicy, contract => { contract.artifactFreshness.maxArtifactAgeHours = 0; },
    'artifactFreshness.maxArtifactAgeHours must be positive');
});
test('artifact future skew stays nonnegative', () => {
  rejects(validateArtifactFreshnessPolicy, contract => { contract.artifactFreshness.maxArtifactFutureSkewMinutes = -1; },
    'artifactFreshness.maxArtifactFutureSkewMinutes must be non-negative');
});
test('artifact timestamps must retain ISO-8601 format', () => {
  rejects(validateArtifactFreshnessPolicy, contract => { contract.artifactFreshness.requiresIso8601Timestamp = false; },
    'artifactFreshness.requiresIso8601Timestamp must be true');
});
test('source sample timestamps cannot be dropped from freshness policy', () => {
  rejects(validateArtifactFreshnessPolicy, contract => {
    contract.artifactFreshness.timestampPaths =
      contract.artifactFreshness.timestampPaths.filter(value => value !== 'source.sampleWindow.endedAt');
  }, 'artifactFreshness.timestampPaths must include source.sampleWindow.endedAt');
});
test('every environment artifact format must remain freshness-enforced', () => {
  const context = fixture();
  const format = context.contract.jobs.flatMap(job => job.outputArtifacts ?? [])
    .find(artifact => artifact.env !== undefined)?.format;
  assert.ok(format, 'tracked contract must have an env-linked evidence format');
  context.contract.artifactFreshness.requiredTimestampFormats =
    context.contract.artifactFreshness.requiredTimestampFormats.filter(value => value !== format);
  validateArtifactFreshnessPolicy(context);
  assert.ok(context.violations.includes(
    originalContractPath + ': artifactFreshness.requiredTimestampFormats must include ' + format,
  ));
});
