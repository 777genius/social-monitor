import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Scan dead-letter authorization (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires owner/admin workspace role for support-safe scan dead-letter inspection', async () => {
    const tenant = tenantId('tenant-scan-dlq-auth-e2e');
    const workspace = workspaceId('workspace-scan-dlq-auth-e2e');
    await app.get(InMemoryScanFailureQueueAdapter).deadLetter({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: 'scan-dlq-auth-e2e-1',
      sourceBindingId: 'source-binding-dlq-auth-e2e-1',
      scanPolicyId: 'scan-policy-dlq-auth-e2e-1',
      correlationId: 'correlation-dlq-auth-e2e-1',
      causationId: 'causation-dlq-auth-e2e-1',
      attemptNumber: 3,
      retryBudget: 3,
      failureReason: '429 provider rate limit with internal details',
    });

    const missingRole = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'scan_dead_letters.read',
      },
    });

    const viewerDenied = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(403);

    expect(viewerDenied.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'scan_dead_letters.read',
      },
    });

    const allowed = await request(app.getHttpServer())
      .get('/ingestion/scan-dead-letters')
      .query({ limit: 10 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(allowed.body).toMatchObject({
      deadLetters: [
        expect.objectContaining({
          scanJobId: 'scan-dlq-auth-e2e-1',
          failureClass: 'provider_rate_limited',
          correlationId: 'correlation-dlq-auth-e2e-1',
        }),
      ],
    });
    expect(JSON.stringify(allowed.body)).not.toContain('internal details');
  });
});
