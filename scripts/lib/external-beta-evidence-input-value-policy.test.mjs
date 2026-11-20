import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  postgresUrlEnvNames, rabbitmqUrlEnvNames, localRuntimeEnvNames,
  isLocalRuntimeEnvValue, httpsEvidenceUrlEnvNames, tokenEvidenceEnvNames,
  secretReferenceEnvNames, realEvidenceIdentityEnvNames,
  isFixtureLikeEnvValue, isPlaceholderSecretValue, isRawSecretValueReference,
  createExternalBetaEvidenceValueValidator,
} from './external-beta-evidence-input-value-policy.mjs';

test('each URL and credential category preserves the exact original env membership', () => {
  assert.deepEqual([...postgresUrlEnvNames()], ['DATABASE_URL']);
  assert.deepEqual([...rabbitmqUrlEnvNames()], ['RABBITMQ_URL']);
  assert.deepEqual([...localRuntimeEnvNames()], ['API_BASE_URL', 'DATABASE_URL', 'INFINITY_CONTEXT_URL', 'RABBITMQ_URL', 'RABBITMQ_MANAGEMENT_URL']);
  assert.deepEqual([...httpsEvidenceUrlEnvNames()], ['INFINITY_CONTEXT_URL', 'JWKS_URL', 'OIDC_ISSUER', 'RABBITMQ_MANAGEMENT_URL', 'WEBHOOK_TEST_ENDPOINT']);
  assert.deepEqual([...tokenEvidenceEnvNames()], ['GITHUB_ACCESS_TOKEN', 'INFINITY_CONTEXT_TOKEN', 'REDDIT_ACCESS_TOKEN', 'REDDIT_APP_CLIENT_SECRET', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN']);
  assert.deepEqual([...secretReferenceEnvNames()], ['DATABASE_URL_SECRET_REF', 'OIDC_CONFIG_SECRET_REF', 'OIDC_TEST_TOKEN_REF', 'RABBITMQ_URL_SECRET_REF', 'SYSTEM_DATABASE_URL_SECRET_REF']);
  assert.deepEqual([...realEvidenceIdentityEnvNames()], ['STAGING_ENVIRONMENT_ID', 'SOURCE_LIVE_ENVIRONMENT_ID', 'SOURCE_LIVE_OPERATOR', 'STAGING_SECRET_STORE_ID']);
});

test('category membership returns a fresh mutable Set on each invocation', () => {
  const first = tokenEvidenceEnvNames();
  first.clear();
  assert.equal(tokenEvidenceEnvNames().size, 6);
});

test('local runtime URLs continue to identify local, fixture and Docker host aliases', () => {
  for (const value of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://host.docker.internal:8080', 'https://edge.localhost', 'postgresql://localhost/db', 'https://api.example.com']) {
    assert.equal(isLocalRuntimeEnvValue(value), true, value);
  }
  for (const value of ['not-a-url', 'https://api.production.tld', 'postgresql://db.production.tld/live']) {
    assert.equal(isLocalRuntimeEnvValue(value), false, value);
  }
});

test('fixture-name checks retain segment boundaries and IPv4/IPv6 hostnames', () => {
  for (const value of ['localhost', '127.1.2.3', '0.0.0.0', '[::1]', '::1', 'my-fixture-service', 'API.EXAMPLE.COM', 'mock']) {
    assert.equal(isFixtureLikeEnvValue(value), true, value);
  }
  for (const value of ['production.tld', 'locally-prod.tld', 'testament.tld', 'opaque_43']) {
    assert.equal(isFixtureLikeEnvValue(value), false, value);
  }
});

test('placeholder secrets preserve trimming, case-insensitive matches and fail closed values', () => {
  for (const value of [' ChangeMe ', 'DUMMY', 'placeholder', 'token', 'todo', 'UNDEFINED', 'source_test_value']) {
    assert.equal(isPlaceholderSecretValue(value), true, value);
  }
  for (const value of ['opaque_ref_123', 'actual-production-reference']) {
    assert.equal(isPlaceholderSecretValue(value), false, value);
  }
});

test('raw secret reference prefixes and embedded markers remain prohibited', () => {
  for (const value of [['Bearer', 'synthetic'].join(' '), 'basic synthetic', 'postgres://synthetic', 'postgresql://synthetic', 'amqp://synthetic', 'amqps://synthetic', 'github_pat_fake', 'ghp_fake', 'sk-proj-synthetic', 'sk-live-synthetic', ['wh', 'sec_synthetic'].join(''), 'prefix:' + ['wh', 'sec_synthetic'].join('')]) {
    assert.equal(isRawSecretValueReference(value), true, value);
  }
  assert.equal(isRawSecretValueReference('vault://production/reference'), false);
});

test('value validation preserves accepted immutable digests, URLs, secret references and real identifiers', () => {
  const env = {
    BACKEND_IMAGE_DIGEST: 'sha256:' + 'a'.repeat(64),
    BACKEND_GIT_COMMIT_SHA: 'b'.repeat(40),
    API_BASE_URL: 'https://api.production.tld',
    DATABASE_URL: 'postgresql://db.production.tld/app',
    RABBITMQ_URL: 'amqps://mq.production.tld',
    WEBHOOK_TEST_ENDPOINT: 'https://hooks.production.tld',
    GITHUB_ACCESS_TOKEN: 'opaque123456789012345678901',
    DATABASE_URL_SECRET_REF: 'vault://app/production/main',
    STAGING_ENVIRONMENT_ID: 'release_2026',
  };
  const validator = createExternalBetaEvidenceValueValidator({
    contract: { executionSafety: { criticalEnvValuesMustBeTyped: true } }, env,
    jobInputEnvNames: () => Object.keys(env),
  });
  const violations = [];
  validator.validateEvidenceValueEnv({ jobId: 'release' }, new Set(), violations);
  assert.deepEqual(violations, []);
});

test('value validation rejects invalid typed inputs with unchanged ordered and redacted diagnostics', () => {
  const env = {
    BACKEND_IMAGE_DIGEST: 'sha256:abc',
    BACKEND_GIT_COMMIT_SHA: 'A'.repeat(40),
    API_BASE_URL: 'http://api.production.tld',
    DATABASE_URL: 'postgres://localhost/db',
    RABBITMQ_URL: 'https://mq.production.tld',
    GITHUB_ACCESS_TOKEN: 'changeme',
    DATABASE_URL_SECRET_REF: 'ghp_fake_private',
    STAGING_ENVIRONMENT_ID: 'live_test',
  };
  const validator = createExternalBetaEvidenceValueValidator({
    contract: { executionSafety: { criticalEnvValuesMustBeTyped: true } }, env,
    jobInputEnvNames: () => Object.keys(env),
  });
  const violations = [];
  validator.validateEvidenceValueEnv({ jobId: 'release' }, new Set(), violations);
  assert.deepEqual(violations, [
    'release: env BACKEND_IMAGE_DIGEST must be an immutable sha256 image digest',
    'release: env BACKEND_GIT_COMMIT_SHA must be a full 40-character lowercase git commit SHA',
    'release: env API_BASE_URL must be a valid https URL',
    'release: env DATABASE_URL must not use local, fixture, example, mock or test hostnames',
    'release: env RABBITMQ_URL must be a valid RabbitMQ URL',
    'release: env GITHUB_ACCESS_TOKEN must be a non-placeholder secret value',
    'release: env DATABASE_URL_SECRET_REF must be a non-placeholder secret reference, not a raw secret value',
    'release: env STAGING_ENVIRONMENT_ID must not use local, fixture, example, mock or test identifiers',
  ]);
  assert.equal(violations.join('\n').includes(env.DATABASE_URL_SECRET_REF), false);
});

test('contract and explicit preflight options retain enable, disable and skip semantics', () => {
  const env = { BACKEND_IMAGE_DIGEST: 'invalid', IGNORED_PATH: '/example/fixture.json', SKIP_ME: 'invalid' };
  const validator = createExternalBetaEvidenceValueValidator({
    contract: { executionSafety: { criticalEnvValuesMustBeTyped: false } }, env,
    jobInputEnvNames: () => ['BACKEND_IMAGE_DIGEST', 'BACKEND_IMAGE_DIGEST', 'IGNORED_PATH', 'SKIP_ME', 'EMPTY'],
  });
  const job = { jobId: 'plan' }, violations = [];
  validator.validateEvidenceValueEnv(job, new Set(['SKIP_ME']), violations);
  assert.deepEqual(violations, []);
  validator.validateEvidenceValueEnv(job, new Set(['SKIP_ME']), violations, { enabled: true });
  assert.deepEqual(violations, ['plan: env BACKEND_IMAGE_DIGEST must be an immutable sha256 image digest']);
  validator.validateEvidenceValueEnv(job, new Set(), violations, { enabled: false });
  assert.equal(violations.length, 1);
});

test('value validator observes live env mutations after construction and preserves URL rejection', () => {
  const env = { API_BASE_URL: 'https://api.production.tld' };
  const validator = createExternalBetaEvidenceValueValidator({
    contract: { executionSafety: { criticalEnvValuesMustBeTyped: true } }, env,
    jobInputEnvNames: () => ['API_BASE_URL'],
  });
  const violations = [];
  validator.validateEvidenceValueEnv({ jobId: 'plan' }, new Set(), violations);
  assert.deepEqual(violations, []);
  env.API_BASE_URL = 'https://localhost';
  validator.validateEvidenceValueEnv({ jobId: 'plan' }, new Set(), violations);
  assert.deepEqual(violations, ['plan: env API_BASE_URL must not use local, fixture, example, mock or test hostnames']);
});

test('the sole typed-value validator is called from execution, preflight and artifact validation', () => {
  const runner = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('./external-beta-evidence-input-value-policy.mjs', import.meta.url), 'utf8');
  assert.match(runner, /createExternalBetaEvidenceValueValidator\(\{ contract, env: process\.env, jobInputEnvNames \}\)/);
  assert.match(policy, /export function createExternalBetaEvidenceValueValidator\(/);
  assert.equal((runner.match(/\bvalidateEvidenceValueEnv\(/g) ?? []).length, 3);
  for (const name of ['validateEvidenceValueEnv', 'validateSecretTokenEnv', 'validateSecretReferenceEnv', 'validateHttpsEvidenceUrlEnv', 'validateTypedUrlEnv']) {
    assert.match(policy, new RegExp('^  function ' + name + '\\(', 'm'));
    assert.doesNotMatch(runner, new RegExp('^function ' + name + '\\(', 'm'));
  }
  for (const name of [
    'postgresUrlEnvNames', 'rabbitmqUrlEnvNames', 'localRuntimeEnvNames', 'isLocalRuntimeEnvValue',
    'httpsEvidenceUrlEnvNames', 'tokenEvidenceEnvNames', 'secretReferenceEnvNames',
    'realEvidenceIdentityEnvNames', 'isFixtureLikeEnvValue', 'isPlaceholderSecretValue', 'isRawSecretValueReference',
  ]) {
    assert.match(policy, new RegExp('^export function ' + name + '\\(', 'm'));
    assert.doesNotMatch(runner, new RegExp('^function ' + name + '\\(', 'm'));
  }
});

test('original bounded checker remains and the runner graduates to the hard 1000-line cap', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const command = pkg.scripts['check:external-beta-evidence-runner'];
  assert.ok(command.includes('scripts/lib/external-beta-evidence-input-value-policy.test.mjs && node scripts/run-with-timeout.mjs'));
  assert.ok(command.includes('--timeout-ms 300000 -- node scripts/check-external-beta-evidence-runner.mjs'));
  assert.ok(pkg.scripts['check:architecture'].includes('node --test scripts/lib/external-beta-evidence-input-value-policy.test.mjs'), 'Draft Static must run the new policy tests directly');
  const cap = readFileSync(new URL('../check-source-line-cap.mjs', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  assert.ok(runner.trimEnd().split('\n').length <= 1000, 'runner must remain within hard cap');
  assert.doesNotMatch(cap, /"scripts\/external-beta-evidence-runner\.mjs", \d+/);
});
