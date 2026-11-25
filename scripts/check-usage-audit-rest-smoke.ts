import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [UsageRestModule],
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
    const tenant = tenantId('tenant-usage-audit-rest-smoke');
    const otherTenant = tenantId('tenant-usage-audit-rest-other');
    const workspace = workspaceId('workspace-usage-audit-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const auditLog = moduleRef.get(InMemoryPublicApiAuditLog);

    await auditLog.append({
      id: 'audit-rest-older',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      resourceId: 'feed-page',
      metadata: { source: 'rest-smoke' },
      occurredAt: new Date('2026-06-07T10:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-rest-newer',
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      outcome: 'denied',
      reasonCode: 'rate_limited',
      resourceType: 'feed',
      resourceId: 'feed-page',
      metadata: { source: 'rest-smoke' },
      occurredAt: new Date('2026-06-07T11:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-rest-other-workspace',
      tenantId: tenant,
      workspaceId: workspaceId('workspace-usage-audit-rest-other'),
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      metadata: { source: 'rest-smoke' },
      occurredAt: new Date('2026-06-07T12:00:00.000Z'),
    });
    await auditLog.append({
      id: 'audit-rest-other-tenant',
      tenantId: otherTenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      outcome: 'succeeded',
      resourceType: 'feed',
      metadata: { source: 'rest-smoke' },
      occurredAt: new Date('2026-06-07T13:00:00.000Z'),
    });

    const firstPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ actorType: 'api_key', actorId: 'api-key-1', action: 'feed.list', limit: 1 })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    assert(firstPage.body.auditEvents.length === 1, 'usage audit REST list must honor limit');
    assert(
      firstPage.body.auditEvents[0].id === 'audit-rest-newer',
      'usage audit REST list must sort newest audit events first',
    );
    assert(
      firstPage.body.auditEvents[0].reasonCode === 'rate_limited',
      'usage audit REST list must expose non-secret reason code',
    );
    assert(typeof firstPage.body.nextCursor === 'string', 'usage audit REST list must return cursor');

    const secondPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({
        actorType: 'api_key',
        actorId: 'api-key-1',
        action: 'feed.list',
        limit: 10,
        cursor: firstPage.body.nextCursor,
      })
      .set(headers)
      .set('x-workspace-role', 'admin')
      .expect(200);

    assert(secondPage.body.auditEvents.length === 1, 'usage audit REST cursor must continue page');
    assert(
      secondPage.body.auditEvents[0].id === 'audit-rest-older',
      'usage audit REST cursor must not leak other workspace events',
    );

    const otherTenantPage = await request(app.getHttpServer())
      .get('/usage/audit-events')
      .query({ actorType: 'api_key', actorId: 'api-key-1', action: 'feed.list', limit: 10 })
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'admin')
      .expect(200);

    assert(
      otherTenantPage.body.auditEvents.length === 1 &&
        otherTenantPage.body.auditEvents[0].id === 'audit-rest-other-tenant',
      'usage audit REST must keep same actor/action events isolated by tenant',
    );

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

    console.log('Usage audit REST smoke OK');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
