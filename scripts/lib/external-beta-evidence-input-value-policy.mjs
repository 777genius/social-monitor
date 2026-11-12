import { URL } from 'node:url';

export function postgresUrlEnvNames() {
  return new Set(['DATABASE_URL']);
}

export function rabbitmqUrlEnvNames() {
  return new Set(['RABBITMQ_URL']);
}

export function localRuntimeEnvNames() {
  return new Set(['API_BASE_URL', 'DATABASE_URL', 'INFINITY_CONTEXT_URL', 'RABBITMQ_URL', 'RABBITMQ_MANAGEMENT_URL']);
}

export function isLocalRuntimeEnvValue(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return isFixtureLikeEnvValue(hostname)
    || hostname === 'host.docker.internal'
    || hostname.endsWith('.localhost');
}

export function httpsEvidenceUrlEnvNames() {
  return new Set([
    'INFINITY_CONTEXT_URL',
    'JWKS_URL',
    'OIDC_ISSUER',
    'RABBITMQ_MANAGEMENT_URL',
    'WEBHOOK_TEST_ENDPOINT',
  ]);
}

export function tokenEvidenceEnvNames() {
  return new Set([
    'GITHUB_ACCESS_TOKEN',
    'INFINITY_CONTEXT_TOKEN',
    'REDDIT_ACCESS_TOKEN',
    'REDDIT_APP_CLIENT_SECRET',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_REFRESH_TOKEN',
  ]);
}

export function secretReferenceEnvNames() {
  return new Set(['DATABASE_URL_SECRET_REF', 'OIDC_CONFIG_SECRET_REF', 'OIDC_TEST_TOKEN_REF', 'RABBITMQ_URL_SECRET_REF', 'SYSTEM_DATABASE_URL_SECRET_REF']);
}

export function realEvidenceIdentityEnvNames() {
  return new Set([
    'STAGING_ENVIRONMENT_ID',
    'SOURCE_LIVE_ENVIRONMENT_ID',
    'SOURCE_LIVE_OPERATOR',
    'STAGING_SECRET_STORE_ID',
  ]);
}

export function isFixtureLikeEnvValue(value) {
  const normalized = String(value).toLowerCase();
  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized.startsWith('127.')
  ) {
    return true;
  }
  return normalized.split(/[^a-z0-9]+/).some((segment) => {
    return ['local', 'localhost', 'fixture', 'example', 'synthetic', 'mock', 'test'].includes(segment);
  });
}

export function isPlaceholderSecretValue(value) {
  const normalized = String(value).trim().toLowerCase();
  if (isFixtureLikeEnvValue(normalized)) {
    return true;
  }
  return [
    'changeme',
    'change-me',
    'dummy',
    'placeholder',
    'redacted',
    'secret',
    'token',
    'todo',
    'undefined',
  ].includes(normalized);
}

export function isRawSecretValueReference(value) {
  const normalized = String(value).trim().toLowerCase();
  return [
    'bearer ',
    'basic ',
    'postgres://',
    'postgresql://',
    'amqp://',
    'amqps://',
    'github_pat_',
    'ghp_',
    'sk-proj-',
    'sk-live-',
    'whsec_',
  ].some((fragment) => normalized.startsWith(fragment) || normalized.includes(fragment));
}

