import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
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
    imports: [IdentityRestModule, MonitoringRestModule],
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
    const tenant = tenantId('tenant-write-api-key-monitoring-smoke');
    const workspace = workspaceId('workspace-write-api-key-monitoring-smoke');
    const server = app.getHttpServer();
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const auditLog = moduleRef.get(InMemoryPublicApiAuditLog);
    const workflowSecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Headless monitoring writer',
      scopes: ['read:topics', 'write:topics', 'write:source_bindings', 'write:scan_requests'],
    });
    const readOnlySecret = await createApiKey({
      server,
      tenant,
      workspace,
      name: 'Read-only feed key',
      scopes: ['read:feed'],
    });

    const topic = await request(server)
      .post('/topics')
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-monitoring-smoke-topic')
      .set('idempotency-key', 'write-api-key-monitoring-smoke-topic')
      .send({
        name: 'Write API key monitoring smoke topic',
        query: 'write api key monitoring smoke',
      });

    assert(
      topic.status === 201,
      `write:topics API key must create a topic, got ${topic.status}: ${JSON.stringify(topic.body)}`,
    );

    assert(topic.body.created === true, 'write:topics API key must create a topic');

    await expectMissingIdempotencyKey({
      request: request(server)
        .post('/topics')
        .set(headers)
        .set('Authorization', `Bearer ${workflowSecret}`)
        .send({
          name: 'Missing idempotency topic',
          query: 'missing idempotency',
        }),
      label: 'topic create',
    });

    const binding = await request(server)
      .post(`/topics/${topic.body.topicId}/source-bindings`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-monitoring-smoke-source-binding')
      .set('idempotency-key', 'write-api-key-monitoring-smoke-source-binding')
      .send({
        providerKey: 'fake-source',
        config: {
          query: 'write api key monitoring smoke',
        },
      });

    assert(
      binding.status === 201,
      `write:source_bindings API key must create source binding, got ${binding.status}: ${JSON.stringify(binding.body)}`,
    );

    assert(binding.body.created === true, 'write:source_bindings API key must create source binding');

    await expectMissingIdempotencyKey({
      request: request(server)
        .post(`/topics/${topic.body.topicId}/source-bindings`)
        .set(headers)
        .set('Authorization', `Bearer ${workflowSecret}`)
        .send({
          providerKey: 'fake-source',
          config: {
            query: 'missing idempotency binding',
          },
        }),
      label: 'source binding create',
    });

    const policy = await request(server)
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-monitoring-smoke-policy')
      .set('idempotency-key', 'write-api-key-monitoring-smoke-policy')
      .send({
        intervalSeconds: 900,
        freshnessSeconds: 3600,
        retryBudget: 2,
      });

    assert(
      policy.status === 201,
      `write:source_bindings API key must set scan policy, got ${policy.status}: ${JSON.stringify(policy.body)}`,
    );

    await expectMissingIdempotencyKey({
      request: request(server)
        .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
        .set(headers)
        .set('Authorization', `Bearer ${workflowSecret}`)
        .send({
          intervalSeconds: 900,
          freshnessSeconds: 3600,
          retryBudget: 2,
        }),
      label: 'scan policy set',
    });

    const scan = await request(server)
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .set('x-request-id', 'write-api-key-monitoring-smoke-scan')
      .set('idempotency-key', 'write-api-key-monitoring-smoke-scan');

    assert(
      scan.status === 201,
      `write:scan_requests API key must enqueue scan, got ${scan.status}: ${JSON.stringify(scan.body)}`,
    );

    assert(scan.body.status === 'enqueued', `write:scan_requests API key must enqueue scan, got ${scan.body.status}`);

    await expectMissingIdempotencyKey({
      request: request(server)
        .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
        .set(headers)
        .set('Authorization', `Bearer ${workflowSecret}`),
      label: 'scan request create',
    });

    await expectMissingIdempotencyKey({
      request: request(server)
        .patch(`/topics/${topic.body.topicId}/source-bindings/${binding.body.sourceBindingId}/status`)
        .set(headers)
        .set('Authorization', `Bearer ${workflowSecret}`)
        .send({
          status: 'paused',
        }),
      label: 'source binding status update',
    });

    await request(server)
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set(headers)
      .set('Authorization', `Bearer ${workflowSecret}`)
      .expect(200);

    await request(server)
      .post('/topics')
      .set(headers)
      .set('Authorization', `Bearer ${readOnlySecret}`)
      .set('idempotency-key', 'write-api-key-monitoring-smoke-read-only-denied')
      .send({
        name: 'Forbidden topic',
        query: 'forbidden',
      })
      .expect(403);

    const topicWriteAudit = await auditLog.list({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      action: 'topics.create',
      outcome: 'succeeded',
      resourceType: 'public_api_request',
      limit: 10,
    });

    assert(
      topicWriteAudit.records.some((record) => record.metadata.requiredScope === 'write:topics'),
      'write API key requests must audit required write scope without storing secrets',
    );

    console.log('Write API key monitoring scope smoke OK');
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

const expectMissingIdempotencyKey = async (params: {
  readonly request: request.Test;
  readonly label: string;
}): Promise<void> => {
  const response = await params.request;

  assert(
    response.status === 400,
    `${params.label} without idempotency-key must fail with 400, got ${response.status}: ${JSON.stringify(response.body)}`,
  );
  assert(
    response.body.code === 'validation.failed',
    `${params.label} without idempotency-key must report validation.failed, got ${JSON.stringify(response.body)}`,
  );
  assert(
    response.body.detail === 'idempotency-key header is required',
    `${params.label} without idempotency-key must explain missing header, got ${JSON.stringify(response.body)}`,
  );
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
