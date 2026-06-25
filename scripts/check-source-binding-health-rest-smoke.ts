import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [MonitoringRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  try {
    const tenant = tenantId('tenant-source-health-rest-smoke');
    const workspace = workspaceId('workspace-source-health-rest-smoke');
    const adminHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };
    const viewerHeaders = {
      ...adminHeaders,
      'x-workspace-role': 'viewer',
    };

    const topic = await request(app.getHttpServer())
      .post('/topics')
      .set(adminHeaders)
      .set('idempotency-key', 'topic')
      .send({
        name: 'Source Health',
        query: 'source operational health',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set(adminHeaders)
      .set('idempotency-key', 'binding')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'health' },
      })
      .expect(201);

    const healthBeforePolicy = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(
      healthBeforePolicy.body.healthState === 'not_configured',
      'source health must show missing scan policy before policy setup',
    );
    assert(
      healthBeforePolicy.body.operatorAction === 'create_scan_policy_for_source_binding',
      'source health must return setup action before policy exists',
    );
    assert(
      healthBeforePolicy.body.recentWindow.providerHealthState === 'unknown',
      'source health must expose unknown provider health before scans',
    );
    assert(
      healthBeforePolicy.body.recentWindow.totalScans === 0,
      'source health recent window must start with no scans',
    );

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(adminHeaders)
      .set('idempotency-key', 'policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const healthAfterPolicy = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(healthAfterPolicy.body.healthState === 'scheduled', 'source health must show scheduled source');
    assert(healthAfterPolicy.body.scanPolicy.intervalSeconds === 300, 'source health must expose scan policy');
    assert(healthAfterPolicy.body.latestScan === undefined, 'source health must omit latest scan before first run');

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(adminHeaders)
      .set('idempotency-key', 'scan')
      .expect(201);

    const healthDuringScan = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(healthDuringScan.body.healthState === 'scanning', 'source health must show active scan');
    assert(
      healthDuringScan.body.latestScan.scanJobId === scan.body.scanJobId,
      'source health must expose latest scan job id',
    );
    assert(
      healthDuringScan.body.recentWindow.activeScans === 1,
      'source health recent window must count active scans',
    );
    assert(
      healthDuringScan.body.recentWindow.signals.includes('active_scan_in_progress'),
      'source health recent window must expose active scan signal',
    );

    await request(app.getHttpServer())
      .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
      .set(adminHeaders)
      .set('idempotency-key', 'pause-binding')
      .send({ status: 'paused' })
      .expect(200);

    const pausedHealth = await request(app.getHttpServer())
      .get(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/health`)
      .set(viewerHeaders)
      .expect(200);

    assert(pausedHealth.body.healthState === 'paused', 'source health must prioritize paused state');

    console.log('Source binding health REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
