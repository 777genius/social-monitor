import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  process.env.SOURCE_CONFIG_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');

  const moduleRef = await Test.createTestingModule({
    imports: [IdentityRestModule, MonitoringRestModule, FeedRestModule, SummaryRestModule],
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
    const tenant = tenantId('tenant-read-api-key-smoke');
    const workspace = workspaceId('workspace-read-api-key-smoke');
    const topicId = 'topic-read-api-key-smoke';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const feedItems = moduleRef.get(InMemoryFeedItemReadRepository);
    const auditLog = moduleRef.get(InMemoryPublicApiAuditLog);

    feedItems.upsert(FeedItem.publish({
      id: 'feed-read-api-key-smoke',
      tenantId: tenant,
      workspaceId: workspace,
      topicId,
      sourceItemId: 'source-read-api-key-smoke',
      sourceBindingId: 'binding-read-api-key-smoke',
      canonicalUrl: 'https://example.test/read-api-key-smoke',
      title: 'API key feed read smoke',
      bodyPreview: 'Feed read should be available through read:feed API key scope.',
      authorHandle: 'author',
      publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      observedAt: new Date('2026-06-06T10:05:00.000Z'),
    }));

    const feedSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Smoke feed reader',
      scopes: ['read:feed'],
    });
    const topicSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Smoke topic reader',
      scopes: ['read:topics'],
    });
    const summarySecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Smoke summary reader',
      scopes: ['read:summaries'],
    });
    const otherWorkspaceFeedSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace: workspaceId('workspace-read-api-key-smoke-other'),
      name: 'Smoke other workspace feed reader',
      scopes: ['read:feed'],
    });

    const feedList = await request(app.getHttpServer())
      .get('/feed/items')
      .query({ topicId, limit: 10 })
      .set(headers)
      .set('Authorization', `Bearer ${feedSecret}`)
      .expect(200);

    assert(feedList.body.items.length === 1, 'read:feed API key must list feed items without workspace role');
    assert(
      feedList.body.items[0].id === 'feed-read-api-key-smoke',
      'read:feed API key must return the expected feed item',
    );

    await request(app.getHttpServer())
      .get('/feed/items/feed-read-api-key-smoke')
      .set(headers)
      .set('Authorization', `Bearer ${feedSecret}`)
      .expect(200);

    const feedReadAudit = await auditLog.list({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      action: 'feed.read',
      outcome: 'succeeded',
      resourceType: 'public_api_request',
      limit: 10,
    });

    assert(feedReadAudit.records.length >= 2, 'read:feed API key requests must create public API audit events');
    assert(
      feedReadAudit.records.every((record) => record.metadata.requiredScope === 'read:feed'),
      'API key request audit events must preserve the required scope without storing secrets',
    );

    await request(app.getHttpServer())
      .get('/feed/items')
      .set(headers)
      .set('Authorization', `Bearer ${summarySecret}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/feed/items')
      .set(headers)
      .set('Authorization', `Bearer ${otherWorkspaceFeedSecret}`)
      .expect(403);

    const createdTopic = await request(app.getHttpServer())
      .post('/topics')
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'read-api-key-smoke-topic-request')
      .set('idempotency-key', 'read-api-key-smoke-topic-request')
      .send({
        name: 'Read API key smoke topic',
        query: 'read api key smoke',
      })
      .expect(201);
    const createdBinding = await request(app.getHttpServer())
      .post(`/topics/${createdTopic.body.topicId}/source-bindings`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'read-api-key-smoke-source-binding-request')
      .set('idempotency-key', 'read-api-key-smoke-source-binding-request')
      .send({
        providerKey: 'fake-source',
        config: {
          query: 'read api key smoke',
        },
      })
      .expect(201);

    const topics = await request(app.getHttpServer())
      .get('/topics')
      .query({ limit: 10 })
      .set(headers)
      .set('Authorization', `Bearer ${topicSecret}`)
      .expect(200);

    assert(
      topics.body.topics.some((item: { readonly id?: string }) => item.id === createdTopic.body.topicId),
      'read:topics API key must list topics',
    );

    const sourceBindings = await request(app.getHttpServer())
      .get(`/topics/${createdTopic.body.topicId}/source-bindings`)
      .query({ limit: 10 })
      .set(headers)
      .set('Authorization', `Bearer ${topicSecret}`)
      .expect(200);

    assert(
      sourceBindings.body.sourceBindings.some((item: { readonly id?: string }) =>
        item.id === createdBinding.body.sourceBindingId,
      ),
      'read:topics API key must list source bindings',
    );

    await request(app.getHttpServer())
      .get(`/topics/${createdTopic.body.topicId}/source-bindings/${createdBinding.body.sourceBindingId}/health`)
      .set(headers)
      .set('Authorization', `Bearer ${topicSecret}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/topics')
      .set(headers)
      .set('Authorization', `Bearer ${feedSecret}`)
      .expect(403);

    const summaryRequest = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set(headers)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'read-api-key-smoke-summary-request')
      .set('idempotency-key', 'read-api-key-smoke-summary-request')
      .expect(201);
    const executed = await moduleRef.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: summaryRequest.body.summaryJobId,
    });

    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error('Expected summary execution to produce a summary id');
    }

    const summaryDetail = await request(app.getHttpServer())
      .get(`/summaries/${executed.value.summaryId}`)
      .set(headers)
      .set('Authorization', `Bearer ${summarySecret}`)
      .expect(200);

    assert(summaryDetail.body.summaryId === executed.value.summaryId, 'read:summaries API key must read summary detail');

    const summaryList = await request(app.getHttpServer())
      .get('/summaries')
      .query({ topicId })
      .set(headers)
      .set('Authorization', `Bearer ${summarySecret}`)
      .expect(200);

    assert(summaryList.body.items.length === 1, 'read:summaries API key must list summaries');

    await request(app.getHttpServer())
      .get(`/summaries/${executed.value.summaryId}`)
      .set(headers)
      .set('Authorization', `Bearer ${feedSecret}`)
      .expect(403);

    console.log('Read API key scope smoke OK');
  } finally {
    await app.close();
  }
}

const createApiKey = async (params: {
  readonly server: Parameters<typeof request>[0];
  readonly tenant: string;
  readonly workspace: string;
  readonly name: string;
  readonly scopes: readonly string[];
}): Promise<string> => {
  const response = await request(params.server)
    .post('/identity/api-keys')
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'admin')
    .send({
      name: params.name,
      scopes: params.scopes,
    })
    .expect(201);

  return response.body.secret;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
