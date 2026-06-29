import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AssembleDigestUseCase } from '@social-monitor/delivery/features/assemble-digest/assemble-digest.use-case';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
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
    imports: [DeliveryRestModule],
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
    const tenant = tenantId('tenant-digest-schedule-rest-smoke');
    const otherTenant = tenantId('tenant-digest-schedule-rest-other');
    const workspace = workspaceId('workspace-digest-schedule-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const deliveryStatusSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Digest status reader',
      scopes: ['read:delivery_status'],
    });
    const deliveryWriteSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Digest status writer',
      scopes: ['write:delivery_status'],
    });
    const wrongScopeSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Digest wrong reader',
      scopes: ['read:feed'],
    });
    const body = {
      recipientKey: 'user-rest-smoke',
      channel: 'in_app',
      interestIds: ['interest-z', 'interest-a', 'interest-a'],
      intervalSeconds: 1800,
      includeNoSignal: true,
      nextRunAt: '2026-06-06T02:00:00.000Z',
    };

    await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .send(body)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set(headers)
      .set('x-workspace-role', 'member')
      .send(body)
      .expect(201);

    assert(created.body.created === true, 'digest schedule REST create must return created=true');
    assert(created.body.schedule.tenantId === tenant, 'digest schedule REST create must preserve tenant scope');
    assert(created.body.schedule.workspaceId === workspace, 'digest schedule REST create must preserve workspace scope');
    assert(
      created.body.schedule.interestIds.join(',') === 'interest-a,interest-z',
      'digest schedule REST create must normalize interest ids',
    );

    const otherTenantCreated = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'member')
      .send({
        ...body,
        recipientKey: 'user-rest-smoke-other-tenant',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .send({
        ...body,
        recipientKey: 'user-rest-smoke-readonly',
      })
      .expect(403);

    const createdWithApiKey = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set(headers)
      .set('Authorization', `Bearer ${deliveryWriteSecret}`)
      .send({
        ...body,
        recipientKey: 'user-rest-smoke-api-key',
      })
      .expect(201);

    assert(
      createdWithApiKey.body.schedule.recipientKey === 'user-rest-smoke-api-key',
      'write:delivery_status API key must create digest schedules without workspace role',
    );

    const listed = await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .query({ limit: 10 })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listed.body.schedules.length === 2, 'digest schedule REST list must return created schedules');
    assert(
      listed.body.schedules.some((schedule: { readonly id: string }) => schedule.id === created.body.schedule.id),
      'digest schedule REST list must include role-created schedule id',
    );
    assert(
      !listed.body.schedules.some(
        (schedule: { readonly id: string }) => schedule.id === otherTenantCreated.body.schedule.id,
      ),
      'digest schedule REST list must not leak schedules from another tenant',
    );

    const otherTenantListed = await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .query({ limit: 10 })
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      otherTenantListed.body.schedules.length === 1 &&
        otherTenantListed.body.schedules[0].id === otherTenantCreated.body.schedule.id,
      'digest schedule REST list must keep schedules isolated by tenant',
    );

    const listedWithApiKey = await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .query({ limit: 2 })
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      listedWithApiKey.body.schedules.some((schedule: { readonly id: string }) => schedule.id === created.body.schedule.id),
      'read:delivery_status API key must list digest schedules without workspace role',
    );

    await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .set(headers)
      .set('Authorization', `Bearer ${wrongScopeSecret}`)
      .expect(403);

    const fetched = await request(app.getHttpServer())
      .get(`/delivery/digest-schedules/${created.body.schedule.id}`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(fetched.body.id === created.body.schedule.id, 'digest schedule REST get must return created schedule');
    assert(fetched.body.recipientKey === body.recipientKey, 'digest schedule REST get must preserve recipient key');

    await request(app.getHttpServer())
      .get(`/delivery/digest-schedules/${created.body.schedule.id}`)
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    const fetchedWithApiKey = await request(app.getHttpServer())
      .get(`/delivery/digest-schedules/${created.body.schedule.id}`)
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      fetchedWithApiKey.body.id === created.body.schedule.id,
      'read:delivery_status API key must read one digest schedule without workspace role',
    );

    const assembled = await moduleRef.get(AssembleDigestUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-rest-smoke',
      channel: 'in_app',
      interestIds: ['interest-z'],
      windowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-06T01:00:00.000Z'),
      includeNoSignal: true,
    });

    if (!assembled.ok) {
      throw assembled.error;
    }

    const digestWithApiKey = await request(app.getHttpServer())
      .get(`/delivery/digests/${assembled.value.digest.id}`)
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      digestWithApiKey.body.id === assembled.value.digest.id,
      'read:delivery_status API key must read digest details without workspace role',
    );

    await request(app.getHttpServer())
      .get(`/delivery/digests/${assembled.value.digest.id}`)
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    await request(app.getHttpServer())
      .get(`/delivery/digests/${assembled.value.digest.id}`)
      .set(headers)
      .set('Authorization', `Bearer ${wrongScopeSecret}`)
      .expect(403);

    console.log('Digest schedule REST smoke OK');
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

void main();
