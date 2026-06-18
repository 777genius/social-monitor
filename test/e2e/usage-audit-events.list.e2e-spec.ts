import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Usage audit events API (e2e)', () => {
  let app: INestApplication;
  let auditLog: InMemoryPublicApiAuditLog;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    auditLog = moduleRef.get(InMemoryPublicApiAuditLog);
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

  it('lists scoped audit events with filters, cursor pagination and admin-only access', async () => {
    const tenant = tenantId('tenant-usage-audit-e2e');
    const workspace = workspaceId('workspace-usage-audit-e2e');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };

    await auditLog.append({
      id: 'audit-e2e-older',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      resourceId: 'feed-page-e2e',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T10:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-e2e-newer',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'denied',
      reasonCode: 'rate_limited',
      resourceType: 'feed',
      resourceId: 'feed-page-e2e',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T11:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-e2e-other-workspace',
      tenantId: tenant,
      workspaceId: workspaceId('workspace-usage-audit-other-e2e'),
      actorType: 'api_key',
      actorId: 'api-key-e2e-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      metadata: { source: 'e2e' },
      occurredAt: new Date('2026-06-07T12:00:00.000Z'),
    });

    const firstPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ actorType: 'api_key', actorId: 'api-key-e2e-1', action: 'feed.list', limit: 1 })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(firstPage.body.auditEvents).toEqual([
      expect.objectContaining({
        id: 'audit-e2e-newer',
        outcome: 'denied',
        reasonCode: 'rate_limited',
        metadata: { source: 'e2e' },
      }),
    ]);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({
        actorType: 'api_key',
        actorId: 'api-key-e2e-1',
        action: 'feed.list',
        limit: 10,
        cursor: firstPage.body.nextCursor,
      })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(secondPage.body.auditEvents).toEqual([
      expect.objectContaining({
        id: 'audit-e2e-older',
        outcome: 'succeeded',
      }),
    ]);
    expect(JSON.stringify(secondPage.body)).not.toContain('audit-e2e-other-workspace');

    await request(app.getHttpServer())
      .get('/usage/audit-events')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(403);

    await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ outcome: 'unknown' })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(400);
  });
});
