import { createPrivateKey, randomUUID, sign as signJwt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Pool, type PoolClient } from 'pg';

type JsonRecord = Record<string, unknown>;

type HttpMethod = 'GET' | 'POST' | 'PATCH';

type RunnerConfig = {
  readonly apiBaseUrl: string;
  readonly databaseUrl: string;
  readonly outputPath: string;
  readonly environmentId: string;
  readonly imageDigest: string;
  readonly operator: string;
  readonly issuer: string;
  readonly audience: string;
  readonly privateKeyPem?: string;
  readonly keyId?: string;
  readonly accessToken?: string;
  readonly webhookUrl: string;
};

type RuntimeIds = {
  readonly runId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly membershipId: string;
};

type AuthContext = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly token: string;
};

type SignalResult = {
  readonly signalId: string;
  readonly status: 'passed';
  readonly observedAt: string;
  readonly evidence: JsonRecord;
};

const config = loadConfig();
const ids: RuntimeIds = {
  runId: `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
  tenantId: randomUUID(),
  workspaceId: randomUUID(),
  userId: randomUUID(),
  membershipId: randomUUID(),
};
const pool = new Pool({ connectionString: config.databaseUrl });
const startedAt = nowIso();

void main().catch(async (error: unknown) => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  try {
    await assertReady();
    await seedDurableIdentity(pool, ids);

    const auth: AuthContext = {
      tenantId: ids.tenantId,
      workspaceId: ids.workspaceId,
      token: resolveAccessToken(config, ids),
    };
    const evidence = await executeBackendLoop(auth, ids);
    const completedAt = nowIso();
    const artifact = {
      schemaVersion: 1,
      format: 'staging-reliability-artifact-v1',
      artifactId: 'durable-backend-e2e-output',
      environmentId: config.environmentId,
      imageDigest: config.imageDigest,
      operator: config.operator,
      apiBaseUrl: config.apiBaseUrl,
      startedAt,
      completedAt,
      provenance: {
        evidenceKind: 'staging_drill',
        collectionMethod: 'Docker Compose durable backend e2e loop capture.',
        runner: 'scripts/capture-durable-backend-e2e-loop.ts',
        fixtureOnly: false,
      },
      redaction: {
        secretsIncluded: false,
        rawProviderPayloadsIncluded: false,
        databaseUrlsIncluded: false,
        brokerUrlsIncluded: false,
      },
      signalResults: [
        signalResult('backend-loop-topic-to-delivery-audit', {
          summary: 'topic source scan feed summary feedback digest webhook realtime audit loop observed on durable runtime',
          topicId: evidence.topicId,
          sourceBindingId: evidence.sourceBindingId,
          scanId: evidence.scanId,
          feedItemIds: evidence.feedItemIds,
          summaryId: evidence.summaryId,
          feedbackId: evidence.feedbackId,
          digestId: evidence.digestId,
          webhookEndpointId: evidence.webhookEndpointId,
          webhookDeliveryAttemptId: evidence.webhookDeliveryAttemptId,
          realtimeEventId: evidence.realtimeEventId,
          auditEventIds: evidence.auditEventIds,
        }),
        signalResult('backend-loop-tenant-isolation', {
          summary: 'wrong tenant and wrong workspace checks denied durable data access',
          negativeChecks: evidence.negativeChecks,
          wrongTenantStatus: evidence.wrongTenantStatus,
          wrongWorkspaceStatus: evidence.wrongWorkspaceStatus,
          leakageObserved: false,
        }),
        signalResult('backend-loop-idempotency', {
          summary: 'idempotency keys replayed without duplicate durable side effects',
          idempotencyKeys: evidence.idempotencyKeys,
          responseIds: evidence.responseIds,
          stableDurableCounts: evidence.stableDurableCounts,
          duplicateSideEffectsObserved: false,
        }),
      ] satisfies readonly SignalResult[],
    };

    mkdirSync(dirname(config.outputPath), { recursive: true });
    writeFileSync(config.outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(config.outputPath);
  } finally {
    await pool.end();
  }
}

async function executeBackendLoop(auth: AuthContext, runtimeIds: RuntimeIds): Promise<{
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly scanId: string;
  readonly feedItemIds: readonly string[];
  readonly summaryId: string;
  readonly feedbackId: string;
  readonly digestId: string;
  readonly webhookEndpointId: string;
  readonly webhookDeliveryAttemptId: string;
  readonly realtimeEventId: string;
  readonly auditEventIds: readonly string[];
  readonly negativeChecks: readonly JsonRecord[];
  readonly wrongTenantStatus: number;
  readonly wrongWorkspaceStatus: number;
  readonly idempotencyKeys: readonly string[];
  readonly responseIds: readonly string[];
  readonly stableDurableCounts: JsonRecord;
}> {
  const headers = authHeaders(auth);
  const topicKey = `topic-${runtimeIds.runId}`;
  const bindingKey = `binding-${runtimeIds.runId}`;
  const policyKey = `policy-${runtimeIds.runId}`;
  const scanKey = `scan-${runtimeIds.runId}`;
  const summaryKey = `summary-${runtimeIds.runId}`;
  const feedbackKey = `feedback-${runtimeIds.runId}`;
  const topic = await requestJson<JsonRecord>('POST', '/topics', {
    headers: withIdempotency(headers, topicKey),
    body: {
      name: `Durable Backend Loop ${runtimeIds.runId}`,
      query: 'backend reliability observability',
    },
  });
  const topicId = readString(topic, 'topicId');

  const binding = await requestJson<JsonRecord>('POST', `/topics/${encodeURIComponent(topicId)}/source-bindings`, {
    headers: withIdempotency(headers, bindingKey),
    body: {
      providerKey: 'hacker-news',
      config: {
        mode: 'listing',
        listing: 'top',
      },
    },
  });
  const sourceBindingId = readString(binding, 'sourceBindingId');

  await requestJson<JsonRecord>('POST', `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-policy`, {
    headers: withIdempotency(headers, policyKey),
    body: {
      intervalSeconds: 60,
      freshnessSeconds: 300,
      retryBudget: 3,
    },
  });

  const scan = await requestJson<JsonRecord>('POST', `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-requests`, {
    headers: withIdempotency(headers, scanKey),
  });
  const scanId = readString(scan, 'scanJobId');
  await pollJson<JsonRecord>(
    `/scan-requests/${encodeURIComponent(scanId)}/status`,
    headers,
    (status) => {
      const scanStatus = readString(status, 'status');
      if (scanStatus === 'failed' || scanStatus === 'cancelled') {
        throw new Error(`scan job ${scanId} ended with ${scanStatus}: ${String(status.failureReason ?? '')}`);
      }

      return scanStatus === 'succeeded' ? status : undefined;
    },
    { timeoutMs: 180_000, label: 'scan completion' },
  );

  const feed = await pollJson<JsonRecord>(
    `/feed/items?topicId=${encodeURIComponent(topicId)}&limit=20`,
    headers,
    (page) => {
      const items = readObjectArray(page, 'items');
      return items.length > 0 ? page : undefined;
    },
    { timeoutMs: 60_000, label: 'feed projection' },
  );
  const feedItems = readObjectArray(feed, 'items');
  const feedItemIds = feedItems.map((item) => readString(item, 'id')).slice(0, 5);

  const summary = await requestJson<JsonRecord>('POST', `/topics/${encodeURIComponent(topicId)}/summary-requests`, {
    headers: withIdempotency(headers, summaryKey),
  });
  const summaryJobId = readString(summary, 'summaryJobId');
  const summaryStatus = await pollJson<JsonRecord>(
    `/summary-jobs/${encodeURIComponent(summaryJobId)}/status`,
    headers,
    (status) => {
      const value = readString(status, 'status');
      if (value === 'failed' || value === 'rejected') {
        throw new Error(`summary job ${summaryJobId} ended with ${value}: ${String(status.failureReason ?? '')}`);
      }

      return value === 'completed' || value === 'no_signal' ? status : undefined;
    },
    { timeoutMs: 120_000, label: 'summary completion' },
  );
  const summaryId = readString(summaryStatus, 'summaryId');
  const summaryArtifact = await requestJson<JsonRecord>('GET', `/summaries/${encodeURIComponent(summaryId)}`, { headers });
  const citations = readObjectArray(summaryArtifact, 'citations');
  const firstCitationId = citations.length === 0 ? undefined : readString(citations[0] ?? {}, 'citationId');

  const realtimeChannel = `topic:${topicId}:summary-status`;
  const realtime = await pollJson<JsonRecord>(
    `/realtime/events?channel=${encodeURIComponent(realtimeChannel)}&limit=20`,
    headers,
    (page) => {
      const events = readObjectArray(page, 'events');
      return events.find((event) => readString(event, 'resourceId') === summaryId);
    },
    { timeoutMs: 90_000, label: 'summary realtime projection' },
  );
  const realtimeEventId = readString(realtime, 'id');

  const feedback = await requestJson<JsonRecord>('POST', `/summaries/${encodeURIComponent(summaryId)}/feedback`, {
    headers: {
      ...withIdempotency(headers, feedbackKey),
      'x-actor-id': 'durable-backend-loop-operator',
    },
    body: {
      category: 'bad_citation',
      rating: 4,
      comment: 'Citation reviewed during durable backend loop evidence capture.',
      ...(firstCitationId === undefined ? {} : { citationId: firstCitationId }),
    },
  });
  const feedbackId = readString(feedback, 'feedbackId');

  const webhook = await requestJson<JsonRecord>('POST', '/delivery/webhook-endpoints', {
    headers,
    body: {
      url: config.webhookUrl,
      eventTypes: ['digest.ready.v1'],
    },
  });
  const webhookEndpoint = readRecord(webhook, 'endpoint');
  const webhookEndpointId = readString(webhookEndpoint, 'id');

  await requestJson<JsonRecord>('POST', '/delivery/digest-schedules', {
    headers,
    body: {
      recipientKey: webhookEndpointId,
      channel: 'webhook',
      topicIds: [topicId],
      intervalSeconds: 60,
      includeNoSignal: true,
      nextRunAt: new Date(Date.now() + 3_000).toISOString(),
    },
  });

  const deliveryAttempt = await pollJson<JsonRecord>(
    '/delivery/attempts?limit=20',
    headers,
    (page) => {
      const attempts = readObjectArray(page, 'attempts');
      return attempts.find((attempt) =>
        readString(attempt, 'recipientKey') === webhookEndpointId &&
        readString(attempt, 'resourceType') === 'digest' &&
        readString(attempt, 'state') !== 'queued'
      );
    },
    { timeoutMs: 180_000, label: 'digest webhook delivery attempt' },
  );
  const webhookDeliveryAttemptId = readString(deliveryAttempt, 'id');
  const digestId = readString(deliveryAttempt, 'resourceId');
  await requestJson<JsonRecord>('GET', `/delivery/digests/${encodeURIComponent(digestId)}`, { headers });

  const auditPage = await pollJson<JsonRecord>(
    '/usage/audit-events?limit=50',
    headers,
    (page) => {
      const auditEvents = readObjectArray(page, 'auditEvents');
      return auditEvents.length >= 4 ? page : undefined;
    },
    { timeoutMs: 60_000, label: 'audit events' },
  );
  const auditEventIds = readObjectArray(auditPage, 'auditEvents')
    .map((event) => readString(event, 'id'))
    .slice(0, 8);

  const wrongTenantAuth = {
    tenantId: randomUUID(),
    workspaceId: auth.workspaceId,
    token: resolveAccessToken(config, {
      ...runtimeIds,
      tenantId: randomUUID(),
      workspaceId: auth.workspaceId,
    }),
  };
  const wrongWorkspaceAuth = {
    tenantId: auth.tenantId,
    workspaceId: randomUUID(),
    token: resolveAccessToken(config, {
      ...runtimeIds,
      tenantId: auth.tenantId,
      workspaceId: randomUUID(),
    }),
  };
  const wrongTenantStatus = await requestStatus('/feed/items?limit=1', authHeaders(wrongTenantAuth));
  const wrongWorkspaceStatus = await requestStatus(
    `/summaries/${encodeURIComponent(summaryId)}`,
    authHeaders(wrongWorkspaceAuth),
  );
  const auditWrongWorkspaceStatus = await requestStatus('/usage/audit-events?limit=1', authHeaders(wrongWorkspaceAuth));
  if (wrongTenantStatus < 400 || wrongWorkspaceStatus < 400 || auditWrongWorkspaceStatus < 400) {
    throw new Error('tenant isolation negative checks did not deny access');
  }

  const countsBeforeReplay = await durableCounts(pool, auth.tenantId, auth.workspaceId);
  const replayedTopic = await requestJson<JsonRecord>('POST', '/topics', {
    headers: withIdempotency(headers, topicKey),
    body: {
      name: `Durable Backend Loop ${runtimeIds.runId}`,
      query: 'backend reliability observability',
    },
  });
  const replayedScan = await requestJson<JsonRecord>('POST', `/source-bindings/${encodeURIComponent(sourceBindingId)}/scan-requests`, {
    headers: withIdempotency(headers, scanKey),
  });
  const replayedSummary = await requestJson<JsonRecord>('POST', `/topics/${encodeURIComponent(topicId)}/summary-requests`, {
    headers: withIdempotency(headers, summaryKey),
  });
  const countsAfterReplay = await durableCounts(pool, auth.tenantId, auth.workspaceId);
  if (JSON.stringify(countsBeforeReplay) !== JSON.stringify(countsAfterReplay)) {
    throw new Error('durable counts changed after idempotency replay');
  }

  return {
    topicId,
    sourceBindingId,
    scanId,
    feedItemIds,
    summaryId,
    feedbackId,
    digestId,
    webhookEndpointId,
    webhookDeliveryAttemptId,
    realtimeEventId,
    auditEventIds,
    negativeChecks: [
      { surface: 'feed', expectedStatusAtLeast: 400, observedStatus: wrongTenantStatus },
      { surface: 'summary', expectedStatusAtLeast: 400, observedStatus: wrongWorkspaceStatus },
      { surface: 'audit', expectedStatusAtLeast: 400, observedStatus: auditWrongWorkspaceStatus },
    ],
    wrongTenantStatus,
    wrongWorkspaceStatus,
    idempotencyKeys: [topicKey, bindingKey, policyKey, scanKey, summaryKey, feedbackKey],
    responseIds: [
      readString(replayedTopic, 'topicId'),
      readString(replayedScan, 'scanJobId'),
      readString(replayedSummary, 'summaryJobId'),
      webhookDeliveryAttemptId,
    ],
    stableDurableCounts: countsAfterReplay,
  };
}

async function assertReady(): Promise<void> {
  const ready = await requestJson<JsonRecord>('GET', '/ready', { headers: {} });
  if (ready.status !== 'ok') {
    throw new Error('API /ready must report ok');
  }
  const runtime = readRecord(ready, 'runtime');
  if (runtime.runtimeProfile !== 'beta') {
    throw new Error('API runtimeProfile must be beta for durable backend evidence capture');
  }
}

async function seedDurableIdentity(db: Pool, runtimeIds: RuntimeIds): Promise<void> {
  await withClient(db, async (client) => {
    await client.query('begin');
    try {
      await client.query(
        `
          insert into tenants (id, slug, name, created_at, updated_at)
          values ($1, $2, $3, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [runtimeIds.tenantId, `tenant-${runtimeIds.runId}`, 'Durable Backend Loop Tenant'],
      );
      await client.query(
        `
          insert into workspaces (id, tenant_id, slug, name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [runtimeIds.workspaceId, runtimeIds.tenantId, `workspace-${runtimeIds.runId}`, 'Durable Backend Loop Workspace'],
      );
      await client.query(
        `
          insert into users (id, tenant_id, email, display_name, created_at, updated_at)
          values ($1, $2, $3, $4, now(), now())
          on conflict (id) do update set updated_at = excluded.updated_at
        `,
        [runtimeIds.userId, runtimeIds.tenantId, `ops-${runtimeIds.runId}@internal.local`, 'Backend Loop Operator'],
      );
      await client.query(
        `
          insert into memberships (id, tenant_id, workspace_id, user_id, role, created_at, updated_at)
          values ($1, $2, $3, $4, 'OWNER', now(), now())
          on conflict (tenant_id, workspace_id, user_id) do update set role = 'OWNER', updated_at = excluded.updated_at
        `,
        [runtimeIds.membershipId, runtimeIds.tenantId, runtimeIds.workspaceId, runtimeIds.userId],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  });
}

async function durableCounts(db: Pool, tenantId: string, workspaceId: string): Promise<JsonRecord> {
  return withClient(db, async (client) => {
    const result = await client.query<{
      topics: number;
      scan_jobs: number;
      feed_items: number;
      summary_jobs: number;
      summaries: number;
      feedback: number;
      digests: number;
      delivery_attempts: number;
    }>(
      `
        select
          (select count(*)::int from topics where tenant_id = $1 and workspace_id = $2) as topics,
          (select count(*)::int from scan_jobs where tenant_id = $1 and workspace_id = $2) as scan_jobs,
          (select count(*)::int from feed_items where tenant_id = $1 and workspace_id = $2) as feed_items,
          (select count(*)::int from summary_jobs where tenant_id = $1 and workspace_id = $2) as summary_jobs,
          (select count(*)::int from summary_artifacts where tenant_id = $1 and workspace_id = $2) as summaries,
          (select count(*)::int from summary_feedback where tenant_id = $1 and workspace_id = $2) as feedback,
          (select count(*)::int from digests where tenant_id = $1 and workspace_id = $2) as digests,
          (select count(*)::int from delivery_attempts where tenant_id = $1 and workspace_id = $2) as delivery_attempts
      `,
      [tenantId, workspaceId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('durable count query returned no row');
    }

    return {
      topics: Number(row.topics),
      scanJobs: Number(row.scan_jobs),
      feedItems: Number(row.feed_items),
      summaryJobs: Number(row.summary_jobs),
      summaries: Number(row.summaries),
      feedback: Number(row.feedback),
      digests: Number(row.digests),
      deliveryAttempts: Number(row.delivery_attempts),
    };
  });
}

async function withClient<T>(db: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

function resolveAccessToken(runnerConfig: RunnerConfig, runtimeIds: RuntimeIds): string {
  if (runnerConfig.accessToken !== undefined) {
    return runnerConfig.accessToken;
  }
  if (runnerConfig.privateKeyPem === undefined || runnerConfig.keyId === undefined) {
    throw new Error('DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM and DURABLE_BACKEND_E2E_JWT_KID are required when no access token is supplied');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const privateKey = createPrivateKey(runnerConfig.privateKeyPem);
  const encodedHeader = encodeJson({
    alg: 'RS256',
    typ: 'JWT',
    kid: runnerConfig.keyId,
  });
  const encodedPayload = encodeJson({
    sub: runtimeIds.userId,
    iss: runnerConfig.issuer,
    aud: runnerConfig.audience,
    iat: nowSeconds,
    exp: nowSeconds + 900,
    tenant_id: runtimeIds.tenantId,
    workspace_id: runtimeIds.workspaceId,
    workspace_roles: ['owner'],
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signJwt('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey).toString('base64url');

  return `${signingInput}.${signature}`;
}

function authHeaders(auth: AuthContext): Record<string, string> {
  return {
    'x-tenant-id': auth.tenantId,
    'x-workspace-id': auth.workspaceId,
    authorization: `Bearer ${auth.token}`,
    'x-request-id': `durable-backend-loop-${randomUUID()}`,
  };
}

function withIdempotency(headers: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return {
    ...headers,
    'idempotency-key': key,
  };
}

async function pollJson<T extends JsonRecord>(
  path: string,
  headers: Readonly<Record<string, string>>,
  done: (value: JsonRecord) => T | undefined,
  options: { readonly timeoutMs: number; readonly label: string },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let lastValue: JsonRecord | undefined;
  while (Date.now() < deadline) {
    const value = await requestJson<JsonRecord>('GET', path, { headers });
    lastValue = value;
    const result = done(value);
    if (result !== undefined) {
      return result;
    }
    await delay(1_000);
  }

  throw new Error(`${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`);
}

async function requestStatus(path: string, headers: Readonly<Record<string, string>>): Promise<number> {
  const response = await fetch(new URL(path, config.apiBaseUrl), {
    method: 'GET',
    headers,
  });

  await response.arrayBuffer().catch(() => undefined);
  return response.status;
}

async function requestJson<T extends JsonRecord>(
  method: HttpMethod,
  path: string,
  options: {
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: JsonRecord;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };
  const response = await fetch(new URL(path, config.apiBaseUrl), {
    method,
    headers: options.body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = parseJsonResponse(text);

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${method} ${path} failed with HTTP ${response.status}: ${safeHttpErrorBody(body)}`);
  }
  if (!isRecord(body)) {
    throw new Error(`${method} ${path} did not return a JSON object`);
  }

  return body as T;
}

function parseJsonResponse(text: string): unknown {
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function safeHttpErrorBody(body: unknown): string {
  const serialized = JSON.stringify(body);
  return serialized.length > 1_000 ? `${serialized.slice(0, 1_000)}...` : serialized;
}

function signalResult(signalId: string, evidence: JsonRecord): SignalResult {
  return {
    signalId,
    status: 'passed',
    observedAt: nowIso(),
    evidence,
  };
}

function loadConfig(): RunnerConfig {
  const apiBaseUrl = requireEnv('API_BASE_URL');
  const configValue: RunnerConfig = {
    apiBaseUrl,
    databaseUrl: requireEnv('DATABASE_URL'),
    outputPath: requireEnv('DURABLE_BACKEND_E2E_ARTIFACT_PATH'),
    environmentId: requireEnv('STAGING_ENVIRONMENT_ID'),
    imageDigest: requireEnv('BACKEND_IMAGE_DIGEST'),
    operator: process.env.STAGING_OPERATOR ?? 'backend-ops-1',
    issuer: process.env.SOCIAL_MONITOR_OIDC_ISSUER ?? process.env.DURABLE_BACKEND_E2E_OIDC_ISSUER ?? '',
    audience: process.env.SOCIAL_MONITOR_OIDC_AUDIENCE ?? process.env.DURABLE_BACKEND_E2E_OIDC_AUDIENCE ?? '',
    privateKeyPem: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_PRIVATE_KEY_PEM),
    keyId: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_JWT_KID),
    accessToken: emptyToUndefined(process.env.DURABLE_BACKEND_E2E_ACCESS_TOKEN),
    webhookUrl: process.env.DURABLE_BACKEND_E2E_WEBHOOK_URL ?? 'https://httpbingo.org/post',
  };

  if (!/^https?:\/\//.test(configValue.apiBaseUrl)) {
    throw new Error('API_BASE_URL must be an http(s) URL');
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(configValue.imageDigest)) {
    throw new Error('BACKEND_IMAGE_DIGEST must be sha256:<64 hex chars>');
  }
  if (configValue.accessToken === undefined && (configValue.issuer.trim() === '' || configValue.audience.trim() === '')) {
    throw new Error('SOCIAL_MONITOR_OIDC_ISSUER and SOCIAL_MONITOR_OIDC_AUDIENCE are required when signing runner JWTs');
  }

  return configValue;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readRecord(source: JsonRecord, field: string): JsonRecord {
  const value = source[field];
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be an object`);
  }

  return value;
}

function readString(source: JsonRecord, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }

  return value;
}

function readObjectArray(source: JsonRecord, field: string): readonly JsonRecord[] {
  const value = source[field];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error(`Expected ${field} to be an object array`);
  }

  return value as readonly JsonRecord[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encodeJson(value: JsonRecord): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
