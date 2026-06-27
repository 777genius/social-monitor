import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [IdentityRestModule, SummaryRestModule],
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
    const tenant = tenantId('tenant-write-api-key-summary-smoke');
    const otherTenant = tenantId('tenant-write-api-key-summary-smoke-other');
    const workspace = workspaceId('workspace-write-api-key-summary-smoke');
    const topicId = 'topic-write-api-key-summary-smoke';
    const server = app.getHttpServer();
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const workflowSecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Headless summary writer',
      scopes: ['read:summaries', 'write:summaries'],
    });
    const readOnlySecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Read-only summary key',
      scopes: ['read:summaries'],
    });

    await request(server)
      .put(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-summary-smoke-policy')
      .send({
        language: 'en',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 5,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(200);

    await request(server)
      .get(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    await request(server)
      .put(`/topics/${topicId}/summary-policy`)
      .set(otherTenantHeaders)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-summary-smoke-wrong-tenant')
      .send({
        language: 'en',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 5,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(403);

    const summary = await request(server)
      .post(`/topics/${topicId}/summary-requests`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-summary-smoke-request')
      .set('idempotency-key', 'write-api-key-summary-smoke-request')
      .expect(201);

    assert(summary.body.created === true, 'write:summaries API key must request summary');

    await request(server)
      .get(`/summary-jobs/${summary.body.summaryJobId}/status`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    await request(server)
      .put(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .set('x-request-id', 'write-api-key-summary-smoke-read-only-denied')
      .send({
        language: 'en',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 4,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(403);

    console.log('Write API key summary scope smoke OK');
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
    });

  assert(
    response.status === 201,
    `API key creation must succeed, got ${response.status}: ${JSON.stringify(response.body)}`,
  );

  return response.body.secret;
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
