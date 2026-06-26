/* global AbortController, fetch */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const memoStackRepoDir = resolve(process.env.MEMO_STACK_REPO_DIR?.trim() || '../memo-stack');
const timeoutMs = positiveIntegerEnv('SUMMARY_MEMORY_FULL_RUNTIME_TIMEOUT_MS', 10_000);
const requiredFullServices = [
  'infinity_context_postgres',
  'infinity_context_qdrant',
  'infinity_context_neo4j',
  'infinity_context_server_full',
  'infinity_context_worker_full',
  'infinity_context_extraction_worker_full',
];

assert(existsSync(memoStackRepoDir), `MEMO_STACK_REPO_DIR must point at memo-stack repo: ${memoStackRepoDir}`);
assert(existsSync(resolve(memoStackRepoDir, 'docker-compose.yml')), `${memoStackRepoDir}: docker-compose.yml is required`);
assert(existsSync(resolve(memoStackRepoDir, 'Makefile')), `${memoStackRepoDir}: Makefile is required`);

const services = execFileSync('docker', ['compose', '--profile', 'full', 'config', '--services'], {
  cwd: memoStackRepoDir,
  encoding: 'utf8',
  timeout: timeoutMs,
}).trim().split(/\r?\n/u).filter((line) => line.length > 0);
for (const service of requiredFullServices) {
  assert(services.includes(service), `memo-stack full compose profile must include ${service}`);
}

assert(hasOpenAiSecretBoundary(), [
  'Full memo-stack runtime requires MEMORY_OPENAI_API_KEY, OPENAI_API_KEY, or MEMORY_OPENAI_API_KEY_FILE.',
  'Use an ignored env file or shell secret; do not commit provider keys.',
].join(' '));

if (hasRuntimeEnv()) {
  await assertRuntimeCapabilities();
}

console.log([
  'Summary memory full runtime preflight OK',
  `Memo-stack repo: ${memoStackRepoDir}`,
  `Compose services: ${requiredFullServices.join(', ')}`,
  `Runtime capabilities checked: ${hasRuntimeEnv() ? 'yes' : 'no'}`,
].join('\n'));

function hasOpenAiSecretBoundary() {
  if (nonEmptyEnv('MEMORY_OPENAI_API_KEY') || nonEmptyEnv('OPENAI_API_KEY')) {
    return true;
  }

  const keyFile = process.env.MEMORY_OPENAI_API_KEY_FILE?.trim();
  if (keyFile === undefined || keyFile.length === 0) {
    return false;
  }
  if (!existsSync(keyFile)) {
    throw new Error(`MEMORY_OPENAI_API_KEY_FILE does not exist: ${keyFile}`);
  }
  const stat = statSync(keyFile);
  if (!stat.isFile()) {
    throw new Error(`MEMORY_OPENAI_API_KEY_FILE must point at a file: ${keyFile}`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('MEMORY_OPENAI_API_KEY_FILE must use private 0600-style permissions');
  }

  return true;
}

function hasRuntimeEnv() {
  return nonEmptyEnv('INFINITY_CONTEXT_URL') && nonEmptyEnv('INFINITY_CONTEXT_TOKEN');
}

async function assertRuntimeCapabilities() {
  const baseUrl = requiredEnv('INFINITY_CONTEXT_URL').replace(/\/+$/u, '');
  const token = requiredEnv('INFINITY_CONTEXT_TOKEN');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v1/capabilities`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    assert.equal(response.ok, true, `/v1/capabilities must return 2xx, got ${response.status}`);
    const payload = await response.json();
    assertRecord(payload, 'capabilities response');
    assert.equal(payload.service_name, 'infinity-context', 'capabilities response must come from memo-stack');
    for (const adapterName of ['qdrant', 'graphiti', 'embeddings']) {
      const adapter = assertRecord(payload.adapters?.[adapterName], `adapters.${adapterName}`);
      assert.equal(adapter.enabled, true, `memo-stack ${adapterName} adapter must be enabled`);
      assert.equal(adapter.healthy, true, `memo-stack ${adapterName} adapter must be healthy`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function nonEmptyEnv(name) {
  return (process.env[name]?.trim().length ?? 0) > 0;
}

function positiveIntegerEnv(name, fallback) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function assertRecord(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);

  return value;
}
