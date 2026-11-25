import assert from 'node:assert/strict';

const baseUrl = requiredEnv('INFINITY_CONTEXT_URL').replace(/\/+$/u, '');
const token = requiredEnv('INFINITY_CONTEXT_TOKEN');
const timeoutMs = positiveIntegerEnv('SUMMARY_MEMORY_FULL_RUNTIME_TIMEOUT_MS', 10_000);

const requiredAdapters = ['qdrant', 'graphiti', 'embeddings'];
const requiredCapabilities = [
  { capability: 'vector_recall', adapterName: 'qdrant' },
  { capability: 'temporal_fact_graph', adapterName: 'graphiti' },
  { capability: 'engine_health', adapterName: 'embeddings' },
];

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

  for (const adapterName of requiredAdapters) {
    const adapter = assertRecord(payload.adapters?.[adapterName], `adapters.${adapterName}`);
    assert.equal(adapter.enabled, true, `memo-stack ${adapterName} adapter must be enabled`);
    assert.equal(adapter.healthy, true, `memo-stack ${adapterName} adapter must be healthy`);
    assert(
      adapter.degraded_reason === undefined || adapter.degraded_reason === null || adapter.degraded_reason === '',
      `memo-stack ${adapterName} adapter must not be degraded`,
    );
  }

  assert(Array.isArray(payload.capabilities), 'capabilities response must include capability list');
  for (const expected of requiredCapabilities) {
    const capability = payload.capabilities.find((item) => (
      item?.capability === expected.capability &&
      item?.adapter_name === expected.adapterName
    ));
    assert(capability !== undefined, `missing ${expected.adapterName}:${expected.capability} capability`);
    assert.equal(capability.enabled, true, `${expected.adapterName}:${expected.capability} must be enabled`);
    assert.equal(capability.healthy, true, `${expected.adapterName}:${expected.capability} must be healthy`);
    assert.notEqual(capability.status, 'disabled', `${expected.adapterName}:${expected.capability} must not be disabled`);
  }

  console.log([
    'Summary memory full runtime capabilities OK',
    `Deploy profile: ${String(payload.deploy_profile ?? 'unknown')}`,
    `Policy mode: ${String(payload.policy_mode ?? 'unknown')}`,
    `Adapters: ${requiredAdapters.join(', ')}`,
  ].join('\n'));
} finally {
  clearTimeout(timeout);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
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
