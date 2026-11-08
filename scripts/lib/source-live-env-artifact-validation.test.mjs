import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnvArtifactValidation } from './source-live-env-artifact-validation.mjs';

const evidencePath = 'ops/ingestion/source-live-certification-evidence.json';
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const label = 'passedArtifactContentSchema.envArtifactValidation';
const envRequirements = [
  'SOURCE_LIVE_ENVIRONMENT_ID',
  'BACKEND_IMAGE_DIGEST',
  'BACKEND_GIT_COMMIT_SHA',
  'SOURCE_LIVE_OPERATOR',
];
const providerRequirements = [
  ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', ['hacker-news', 'rss', 'github-issues']],
  ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', ['github-repo-radar']],
  ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', ['github-trending-page']],
  ['REDDIT_LIVE_EVIDENCE_PATH', ['reddit']],
];
const error = (message) => evidencePath + ': ' + message;

function validRules() {
  return [
    ...providerRequirements.map(([envVar, providers]) => ({
      envVar,
      requiredProviders: [...providers],
      format: liveArtifactFormat,
      requiredEnv: [...envRequirements],
    })),
    {
      envVar: 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
      kind: 'reddit-credential-lifecycle-redacted',
      sha256MustMatchSignal: 'reddit-credential-lifecycle',
      requiredEnv: [],
    },
  ];
}

function validate(rules, violations = []) {
  validateEnvArtifactValidation(rules, { evidencePath, liveArtifactFormat, violations });
  return violations;
}

test('canonical provider and credential lifecycle requirements pass without mutation', () => {
  const rules = validRules();
  const snapshot = globalThis.structuredClone(rules);
  assert.deepEqual(validate(rules), []);
  assert.deepEqual(rules, snapshot);
});

test('non-array input preserves the original fail-closed diagnostic', () => {
  assert.deepEqual(validate(null), [
    error('passedArtifactContentSchema.envArtifactValidation must be an array'),
  ]);
});

test('missing all entries reports every required environment name in order', () => {
  assert.deepEqual(validate([]), [...providerRequirements.map(([name]) =>
    error('envArtifactValidation must include ' + name)),
    error('envArtifactValidation must include REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH'),
  ]);
});

test('malformed array entry reports its index and still validates remaining rules', () => {
  assert.deepEqual(validate([null, ...validRules()]), [
    error(label + '[0] must be an object'),
  ]);
});

test('unknown environment name is rejected even when all required entries exist', () => {
  assert.deepEqual(validate([...validRules(), { envVar: 'UNEXPECTED_EVIDENCE_PATH' }]), [
    error(label + '[5].envVar is unsupported'),
  ]);
});

test('missing provider coverage retains provider-specific ordering', () => {
  const rules = validRules();
  rules[0].requiredProviders = ['hacker-news'];
  assert.deepEqual(validate(rules), [
    error(label + '[0].requiredProviders must include rss'),
    error(label + '[0].requiredProviders must include github-issues'),
  ]);
});

test('wrong format and missing release metadata are reported in order', () => {
  const rules = validRules();
  rules[1].format = 'wrong-format';
  rules[1].requiredEnv = ['BACKEND_IMAGE_DIGEST'];
  assert.deepEqual(validate(rules), [
    error(label + '[1].format must be ' + liveArtifactFormat),
    error(label + '[1].requiredEnv must include SOURCE_LIVE_ENVIRONMENT_ID'),
    error(label + '[1].requiredEnv must include BACKEND_GIT_COMMIT_SHA'),
    error(label + '[1].requiredEnv must include SOURCE_LIVE_OPERATOR'),
  ]);
});

test('lifecycle redaction policy, digest signal, and empty requiredEnv are enforced', () => {
  const rules = validRules();
  rules[4].kind = 'wrong-kind';
  rules[4].sha256MustMatchSignal = 'wrong-signal';
  rules[4].requiredEnv = ['SOURCE_LIVE_OPERATOR'];
  assert.deepEqual(validate(rules), [
    error(label + '[4].kind must be reddit-credential-lifecycle-redacted'),
    error(label + '[4].sha256MustMatchSignal must be reddit-credential-lifecycle'),
    error(label + '[4].requiredEnv must be empty because lifecycle grants can predate the current release artifact'),
  ]);
});

test('legacy compatibility: extra provider values and duplicate entries remain tolerated', () => {
  const rules = validRules();
  rules[0].requiredProviders.push('unlisted-provider');
  rules.push(globalThis.structuredClone(rules[0]));
  assert.deepEqual(validate(rules), []);
});

test('legacy compatibility: non-array lifecycle requiredEnv remains accepted', () => {
  const rules = validRules();
  rules[4].requiredEnv = 'not-an-array';
  assert.deepEqual(validate(rules), []);
});

test('validation appends to the caller-owned violations array without clearing it', () => {
  const errors = ['existing diagnostic'];
  assert.strictEqual(validate([], errors), errors);
  assert.equal(errors[0], 'existing diagnostic');
  assert.equal(errors.length, 6);
});
