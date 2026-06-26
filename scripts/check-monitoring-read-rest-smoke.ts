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
    const tenant = tenantId('tenant-monitoring-read-rest-smoke');
    const workspace = workspaceId('workspace-monitoring-read-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };

    await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    const oldTopic = await request(app.getHttpServer())
      .post('/topics')
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'topic-old')
      .send({
        name: 'AI Infrastructure',
        query: 'AI infrastructure',
      })
      .expect(201);

    const newTopic = await request(app.getHttpServer())
      .post('/topics')
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'topic-new')
      .send({
        name: 'Hacker News AI',
        query: 'AI site:news.ycombinator.com',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'member')
      .query({ limit: 0 })
      .expect(400);

    const firstTopicPage = await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ limit: 1 })
      .expect(200);

    assert(firstTopicPage.body.topics.length === 1, 'topic REST list must honor page limit');
    assert(typeof firstTopicPage.body.nextCursor === 'string', 'topic REST list must return next cursor');

    const secondTopicPage = await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ limit: 1, cursor: firstTopicPage.body.nextCursor })
      .expect(200);

    assert(secondTopicPage.body.topics.length === 1, 'topic REST list second page must return remaining topic');
    assert(
      [firstTopicPage.body.topics[0].id, secondTopicPage.body.topics[0].id].sort().join(',') ===
      [oldTopic.body.topicId, newTopic.body.topicId].sort().join(','),
      'topic REST list cursor must page through both created topics',
    );

    await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .set('idempotency-key', 'binding-forbidden')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'AI', apiToken: 'secret-token' },
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'binding-rss-localhost-rejected')
      .send({
        providerKey: 'rss',
        config: { feedUrl: 'http://127.0.0.1/feed.xml' },
      })
      .expect(400);

    const binding = await request(app.getHttpServer())
      .post(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'binding-fake-source')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'AI', apiToken: 'secret-token' },
      })
      .expect(201);

    const listedBindings = await request(app.getHttpServer())
      .get(`/topics/${newTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listedBindings.body.sourceBindings.length === 1, 'source binding REST list must return binding');
    assert(
      listedBindings.body.sourceBindings[0].id === binding.body.sourceBindingId,
      'source binding REST list must preserve source binding id',
    );
    assert(
      listedBindings.body.sourceBindings[0].configPreview.apiToken.ciphertext === undefined,
      'source binding REST list must not expose encrypted ciphertext',
    );
    assert(
      listedBindings.body.sourceBindings[0].configPreview.apiToken.encrypted === true,
      'source binding REST list must expose safe encrypted config marker',
    );

    const scanPolicy = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('idempotency-key', 'scan-policy-fake-source')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    assert(scanPolicy.body.created === true, 'scan policy REST set must create policy');

    const fetchedScanPolicy = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      fetchedScanPolicy.body.id === scanPolicy.body.scanPolicyId,
      'scan policy REST get must return created policy',
    );
    assert(fetchedScanPolicy.body.intervalSeconds === 300, 'scan policy REST get must preserve interval');

    const dailyHistory = await request(app.getHttpServer())
      .get(`/source-bindings/${binding.body.sourceBindingId}/scan-requests/daily`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .query({ days: 1 })
      .expect(200);

    assert(
      dailyHistory.body.sourceBindingId === binding.body.sourceBindingId,
      'source binding daily history must preserve source binding id',
    );
    assert(
      dailyHistory.body.topicId === newTopic.body.topicId,
      'source binding daily history must expose topic id for frontend routing',
    );
    assert(
      dailyHistory.body.providerKey === 'fake-source',
      'source binding daily history must expose provider key for frontend grouping',
    );
    assert(
      dailyHistory.body.sourceBindingStatus === 'enabled',
      'source binding daily history must expose source binding status',
    );

    await request(app.getHttpServer())
      .get('/topics/missing-topic/source-bindings')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    console.log('Monitoring read REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
