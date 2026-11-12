import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  postgresUrlEnvNames, rabbitmqUrlEnvNames, localRuntimeEnvNames,
  isLocalRuntimeEnvValue, httpsEvidenceUrlEnvNames, tokenEvidenceEnvNames,
  secretReferenceEnvNames, realEvidenceIdentityEnvNames,
  isFixtureLikeEnvValue, isPlaceholderSecretValue, isRawSecretValueReference,
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

test('extracted named exports are the sole implementations and the runner still calls them', () => {
  const runner = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  const policy = readFileSync(new URL('./external-beta-evidence-input-value-policy.mjs', import.meta.url), 'utf8');
  assert.match(runner, /from '.\/lib\/external-beta-evidence-input-value-policy\.mjs'/);
  for (const name of [
    'postgresUrlEnvNames', 'rabbitmqUrlEnvNames', 'localRuntimeEnvNames', 'isLocalRuntimeEnvValue',
    'httpsEvidenceUrlEnvNames', 'tokenEvidenceEnvNames', 'secretReferenceEnvNames',
    'realEvidenceIdentityEnvNames', 'isFixtureLikeEnvValue', 'isPlaceholderSecretValue', 'isRawSecretValueReference',
  ]) {
    assert.match(policy, new RegExp('^export function ' + name + '\\(', 'm'));
    assert.doesNotMatch(runner, new RegExp('^function ' + name + '\\(', 'm'));
    assert.match(runner, new RegExp('\\b' + name + '\\b'));
  }
});

test('original bounded checker remains after policy tests and source cap ratchets', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const command = pkg.scripts['check:external-beta-evidence-runner'];
  assert.ok(command.includes('scripts/lib/external-beta-evidence-input-value-policy.test.mjs && node scripts/run-with-timeout.mjs'));
  assert.ok(command.includes('--timeout-ms 300000 -- node scripts/check-external-beta-evidence-runner.mjs'));
  assert.ok(pkg.scripts['check:architecture'].includes('node --test scripts/lib/external-beta-evidence-input-value-policy.test.mjs'), 'Draft Static must run the new policy tests directly');
  const cap = readFileSync(new URL('../check-source-line-cap.mjs', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../external-beta-evidence-runner.mjs', import.meta.url), 'utf8');
  assert.match(cap, new RegExp('"scripts/external-beta-evidence-runner.mjs", ' + (runner.trimEnd().split('\n').length) + '\\]'));
});
