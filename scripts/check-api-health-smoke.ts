import { Test } from '@nestjs/testing';
import request from 'supertest';

import { HealthController } from '../apps/api-gateway/src/health.controller';

const assertHealthResponse = (body: unknown, route: string): void => {
  const payload = body as {
    readonly status?: unknown;
    readonly service?: unknown;
    readonly checkedAt?: unknown;
    readonly uptimeSeconds?: unknown;
    readonly runtime?: unknown;
    readonly capabilities?: unknown;
    readonly checks?: unknown;
  };

  if (payload.status !== 'ok') {
    throw new Error(`${route} must return status=ok`);
  }

  if (payload.service !== 'api-gateway') {
    throw new Error(`${route} must return service=api-gateway`);
  }

  if (typeof payload.checkedAt !== 'string' || Number.isNaN(Date.parse(payload.checkedAt))) {
    throw new Error(`${route} must return an ISO checkedAt timestamp`);
  }

  if (typeof payload.uptimeSeconds !== 'number' || payload.uptimeSeconds < 0) {
    throw new Error(`${route} must return non-negative uptimeSeconds`);
  }

  if (route.includes('ready')) {
    assertReadinessResponse(payload, route);
  }
};

const assertReadinessResponse = (
  payload: {
    readonly runtime?: unknown;
    readonly capabilities?: unknown;
    readonly checks?: unknown;
  },
  route: string,
): void => {
  const runtime = assertRecord(payload.runtime, `${route} runtime`);
  const persistence = assertRecord(runtime.persistence, `${route} runtime.persistence`);
  const workerLoops = assertRecord(runtime.workerLoops, `${route} runtime.workerLoops`);
  const queues = assertRecord(runtime.queues, `${route} runtime.queues`);
  const providers = assertRecord(runtime.providers, `${route} runtime.providers`);
  const capabilities = assertRecord(payload.capabilities, `${route} capabilities`);
  const enabledBetaSources = capabilities.enabledBetaSources;
  const workerApps = capabilities.workerApps;
  const checks = payload.checks;

  for (const key of ['monitoring', 'feed', 'ingestionSupport', 'summary', 'delivery', 'identity', 'usage']) {
    if (typeof persistence[key] !== 'string' || persistence[key].length === 0) {
      throw new Error(`${route} must expose persistence mode for ${key}`);
    }
  }

  for (const key of [
    'ingestionScanScheduler',
    'ingestionScanQueueDrain',
    'intelligenceSummaryJob',
    'intelligenceSummaryQueueDrain',
    'deliveryDigestScheduler',
    'deliveryAttemptDispatch',
    'deliveryAttemptQueueDrain',
    'eventRelay',
  ]) {
    if (workerLoops[key] !== 'enabled' && workerLoops[key] !== 'disabled') {
      throw new Error(`${route} must expose worker loop mode for ${key}`);
    }
  }

  for (const key of [
    'monitoringScanPublisher',
    'ingestionScanReader',
    'summaryJobPublisher',
    'intelligenceSummaryReader',
    'deliveryAttemptPublisher',
    'deliveryAttemptReader',
  ]) {
    if (typeof queues[key] !== 'string' || queues[key].length === 0) {
      throw new Error(`${route} must expose queue transport mode for ${key}`);
    }
  }

  if (typeof providers.deliveryWebhook !== 'string' || providers.deliveryWebhook.length === 0) {
    throw new Error(`${route} must expose delivery webhook provider mode`);
  }

  if (!Array.isArray(enabledBetaSources) || !enabledBetaSources.includes('reddit')) {
    throw new Error(`${route} must expose enabled beta source readiness`);
  }

  if (!Array.isArray(workerApps) || !workerApps.includes('ingestion-worker') || !workerApps.includes('event-relay')) {
    throw new Error(`${route} must expose worker app readiness metadata`);
  }

  if (capabilities.rest !== 'enabled' || capabilities.websocket !== 'enabled' || capabilities.openapi !== 'enabled') {
    throw new Error(`${route} must expose REST, WebSocket and OpenAPI capabilities`);
  }

  if (!Array.isArray(checks) || checks.some((check) => assertRecord(check, `${route} check`).status !== 'ok')) {
    throw new Error(`${route} readiness checks must all be ok`);
  }
};

const assertRecord = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Readonly<Record<string, unknown>>;
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
  }).compile();
  const app = moduleRef.createNestApplication();

  await app.init();

  try {
    for (const route of ['/health', '/healthz', '/ready', '/health/ready']) {
      const response = await request(app.getHttpServer()).get(route).expect(200);
      assertHealthResponse(response.body, route);
    }

    console.log('API health smoke OK');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
