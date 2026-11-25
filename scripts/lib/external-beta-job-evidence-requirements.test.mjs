import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiredJobEnvNames,
  requiredJobOptionalEnvNames,
  requiredJobEnvAlternatives,
  requiredJobOutputArtifacts,
  requiredSourceLiveCertificationJobIds,
} from './external-beta-job-evidence-requirements.mjs';
import { createExternalBetaJobArtifactRequirementsPolicy } from './external-beta-job-artifact-requirements-policy.mjs';

test('canonical job evidence tables cover the original complete job set', () => {
  assert.equal(requiredJobEnvNames.size, 13);
  assert.equal(requiredJobOptionalEnvNames.size, 5);
  assert.equal(requiredJobEnvAlternatives.size, 8);
  assert.equal(requiredJobOutputArtifacts.size, 13);
  assert.deepEqual(requiredSourceLiveCertificationJobIds, [
    'live-open-connectors', 'live-github-repo-radar',
    'live-github-trending-page', 'live-reddit-oauth',
  ]);
  for (const jobId of requiredJobEnvNames.keys()) {
    assert.ok(requiredJobOutputArtifacts.has(jobId), jobId + ' must retain a required output');
  }
});

test('live source requirements retain provider identity and redaction fields', () => {
  assert.deepEqual(requiredJobOutputArtifacts.get('live-open-connectors'), [{
    kind: 'env',
    ref: 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
    format: 'source-live-provider-evidence-v1',
    expectedArtifactId: 'live-open-connectors-evidence-v1',
    expectedProviderKeys: ['hacker-news', 'rss', 'github-issues'],
  }]);
  assert.ok(requiredJobEnvNames.get('live-open-connectors').includes('SOURCE_LIVE_OPERATOR'));
  assert.deepEqual(requiredJobOptionalEnvNames.get('live-open-connectors'), ['GITHUB_ACCESS_TOKEN']);
  assert.deepEqual(requiredJobOutputArtifacts.get('live-reddit-oauth')[1], {
    kind: 'env',
    ref: 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
    format: 'reddit-credential-lifecycle-redacted-v1',
  });
});

test('credential alternatives retain the credential vs captured artifact trust boundary', () => {
  const alternatives = requiredJobEnvAlternatives.get('live-reddit-oauth');
  assert.equal(alternatives.length, 4);
  assert.deepEqual(alternatives.map(alternative => alternative.label), [
    'reddit_access_token',
    'reddit_refresh_token_flow',
    'reddit_app_refresh_token_flow',
    'reddit_captured_live_artifacts',
  ]);
  assert.equal(alternatives[0].mode, 'live_command_credential');
  assert.equal(alternatives[2].mode, 'live_command_credential');
  assert.equal(alternatives[3].mode, 'captured_artifact');
  assert.deepEqual(alternatives[3].coversEnv, ['REDDIT_ACCESS_TOKEN']);
  assert.ok(requiredJobEnvAlternatives.get('durable-backend-e2e-loop')[0].coversEnv.includes('INFINITY_CONTEXT_TOKEN'));
});

function liveConnectorsFixture() {
  const violations = [];
  const jobId = 'live-open-connectors';
  const job = {
    jobId,
    requiredEnv: [...requiredJobEnvNames.get(jobId)],
    optionalEnv: [...requiredJobOptionalEnvNames.get(jobId)],
    requiredEnvAlternatives: [],
    outputArtifacts: requiredJobOutputArtifacts.get(jobId).map(({ kind, ref, ...rest }) => ({
      ...rest, [kind]: ref,
    })),
    validationCommands: ['check:source-live'],
  };
  const policy = createExternalBetaJobArtifactRequirementsPolicy({
    violations, requiredJobEnvNames, requiredJobOptionalEnvNames,
    requiredJobEnvAlternatives, requiredJobOutputArtifacts,
    existsSync: () => true,
    validationCommandSource: () => 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH source-live-provider-evidence-v1',
  });
  return { job, violations, policy };
}

test('unchanged contract is accepted by original validation policy', () => {
  const { job, violations, policy } = liveConnectorsFixture();
  policy.validateJobArtifacts(job, 'source-live');
  policy.validateRequiredJobEvidence(job, 'source-live');
  assert.deepEqual(violations, []);
});

test('removed required source identity env fails closed', () => {
  const { job, violations, policy } = liveConnectorsFixture();
  job.requiredEnv = job.requiredEnv.filter(value => value !== 'SOURCE_LIVE_OPERATOR');
  policy.validateRequiredJobEvidence(job, 'source-live');
  assert.ok(violations.some(message => message.includes('must include required evidence env "SOURCE_LIVE_OPERATOR"')));
});

test('tampered provider keys and artifact IDs still fail closed', () => {
  for (const property of ['expectedProviderKeys', 'expectedArtifactId', 'format']) {
    const { job, violations, policy } = liveConnectorsFixture();
    job.outputArtifacts[0][property] = property === 'expectedProviderKeys' ? ['rss'] : 'forged-value';
    policy.validateRequiredJobEvidence(job, 'source-live');
    assert.ok(violations.some(message => message.includes('outputArtifacts must include env "LIVE_OPEN_CONNECTORS_EVIDENCE_PATH"')),
      property + ' must fail closed');
  }
});

test('missing optional token declaration is rejected', () => {
  const { job, violations, policy } = liveConnectorsFixture();
  job.optionalEnv = [];
  policy.validateRequiredJobEvidence(job, 'source-live');
  assert.ok(violations.some(message => message.includes('must include optional evidence env "GITHUB_ACCESS_TOKEN"')));
});
