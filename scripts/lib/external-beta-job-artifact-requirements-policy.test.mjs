import assert from 'node:assert/strict';
import test from 'node:test';
import { createExternalBetaJobArtifactRequirementsPolicy } from './external-beta-job-artifact-requirements-policy.mjs';

function fixture() {
  const violations = [];
  const artifact = {
    env: 'EVIDENCE_PATH',
    format: 'source-live-provider-evidence-v1',
    expectedArtifactId: 'source-evidence',
    expectedProviderKeys: ['hacker-news', 'rss'],
  };
  const alternative = { label: 'captured', env: ['EVIDENCE_PATH'], coversEnv: ['EVIDENCE_PATH'] };
  const job = {
    jobId: 'live-source',
    requiredEnv: ['EVIDENCE_PATH'],
    optionalEnv: ['OPTIONAL_TOKEN'],
    requiredEnvAlternatives: [alternative],
    outputArtifacts: [artifact],
    validationCommands: ['npm run check:source'],
  };
  const dependencies = {
    violations,
    requiredJobEnvNames: new Map([['live-source', ['EVIDENCE_PATH']]]),
    requiredJobOptionalEnvNames: new Map([['live-source', ['OPTIONAL_TOKEN']]]),
    requiredJobEnvAlternatives: new Map([['live-source', [alternative]]]),
    requiredJobOutputArtifacts: new Map([['live-source', [{
      kind: 'env', ref: 'EVIDENCE_PATH',
      format: artifact.format, expectedArtifactId: artifact.expectedArtifactId,
      expectedProviderKeys: ['hacker-news', 'rss'],
    }]]]),
    existsSync: path => path === 'fixtures/tracked.json',
    validationCommandSource: () => 'EVIDENCE_PATH source-live-provider-evidence-v1',
  };
  const policy = createExternalBetaJobArtifactRequirementsPolicy(dependencies);
  return { job, artifact, violations, dependencies, policy };
}

function messages(edit, check = 'validateJobArtifacts') {
  const state = fixture();
  edit(state);
  state.policy[check](state.job, 'job');
  return state.violations;
}

test('valid source artifact and mandatory evidence are accepted', () => {
  const state = fixture();
  state.policy.validateJobArtifacts(state.job, 'job');
  state.policy.validateRequiredJobEvidence(state.job, 'job');
  assert.deepEqual(state.violations, []);
});

test('output artifacts are required', () => {
  assert.deepEqual(messages(({ job }) => { job.outputArtifacts = []; }),
    ['job: outputArtifacts must be non-empty']);
});
test('artifact must declare format and path or env', () => {
  const result = messages(({ artifact }) => { delete artifact.env; artifact.format = ''; });
  assert.ok(result.includes('job: output artifact must define format'));
  assert.ok(result.includes('job: output artifact must define path or env'));
});
test('tracked paths remain caller-validated and missing paths fail closed', () => {
  assert.ok(messages(({ artifact }) => { delete artifact.env; artifact.path = 'fixtures/missing.json'; })
    .includes('job: output artifact path must exist: fixtures/missing.json'));
  assert.deepEqual(messages(({ artifact }) => {
    delete artifact.env;
    artifact.path = 'fixtures/tracked.json';
    artifact.format = 'redacted-json';
    delete artifact.expectedProviderKeys;
  }), []);
});
test('unlisted artifact env is rejected', () => {
  assert.ok(messages(({ artifact }) => { artifact.env = 'UNLISTED_ENV'; })
    .includes('job: output artifact env "UNLISTED_ENV" must be listed in requiredEnv or optionalEnv'));
});
test('staging artifact requires a specific expectedArtifactId', () => {
  assert.ok(messages(({ artifact }) => {
    artifact.format = 'staging-reliability-artifact-v1';
    delete artifact.expectedArtifactId;
  }).some(text => text.includes('must define expectedArtifactId')));
});
test('empty expectedArtifactId is rejected', () => {
  assert.ok(messages(({ artifact }) => { artifact.expectedArtifactId = ' '; })
    .includes('job: output artifact expectedArtifactId must be a non-empty string'));
});
test('source live evidence must declare provider keys', () => {
  assert.ok(messages(({ artifact }) => { delete artifact.expectedProviderKeys; })
    .includes('job: source live output artifact env "EVIDENCE_PATH" must define expectedProviderKeys'));
});
test('missing, blank, and repeated provider keys are rejected', () => {
  for (const keys of [[], [''], ['rss', 'rss'], [true]]) {
    assert.ok(messages(({ artifact }) => { artifact.expectedProviderKeys = keys; }).some(text =>
      text.includes('expectedProviderKeys must')));
  }
});
test('validation command must read the artifact env and format', () => {
  for (const source of ['', 'EVIDENCE_PATH', 'source-live-provider-evidence-v1']) {
    const state = fixture();
    state.dependencies.validationCommandSource = () => source;
    const policy = createExternalBetaJobArtifactRequirementsPolicy(state.dependencies);
    policy.validateJobArtifacts(state.job, 'job');
    assert.ok(state.violations.some(text => text.includes('must be read by a validation command')));
  }
});
test('mandatory required and optional evidence environment names remain required', () => {
  const result = messages(({ job }) => { job.requiredEnv = []; job.optionalEnv = []; },
    'validateRequiredJobEvidence');
  assert.ok(result.includes('job: must include required evidence env "EVIDENCE_PATH"'));
  assert.ok(result.includes('job: must include optional evidence env "OPTIONAL_TOKEN"'));
});
test('alternative requirements reject substituted mode and coverage separately', () => {
  for (const substitution of [
    { coversEnv: ['EVIDENCE_PATH'], mode: 'captured_artifact' },
    { coversEnv: ['UNRELATED'] },
  ]) {
    const result = messages(({ job }) => {
      job.requiredEnv.push('UNRELATED');
      job.requiredEnvAlternatives = [{ label: 'captured', env: ['EVIDENCE_PATH'], ...substitution }];
    }, 'validateRequiredJobEvidence');
    assert.ok(result.some(text => text.includes('requiredEnvAlternatives must include "captured"')));
  }
});
test('mandatory output artifacts must match format, id and unordered provider set', () => {
  const state = fixture();
  state.artifact.expectedProviderKeys = ['rss', 'hacker-news'];
  state.policy.validateRequiredJobEvidence(state.job, 'job');
  assert.deepEqual(state.violations, []);
  state.artifact.expectedArtifactId = 'forged';
  state.policy.validateRequiredJobEvidence(state.job, 'job');
  assert.ok(state.violations.some(text => text.includes('outputArtifacts must include env "EVIDENCE_PATH"')));
  assert.ok(messages(({ artifact }) => { artifact.format = 'different-format'; },
    'validateRequiredJobEvidence').some(text => text.includes('outputArtifacts must include env "EVIDENCE_PATH"')));
});
test('incorrect required provider set is rejected', () => {
  assert.ok(messages(({ artifact }) => {
    artifact.expectedProviderKeys = ['rss'];
  }, 'validateRequiredJobEvidence').some(text => text.includes('expectedProviderKeys "hacker-news, rss"')));
});
