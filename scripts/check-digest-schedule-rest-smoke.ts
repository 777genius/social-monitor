import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
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
    const workspace = workspaceId('workspace-digest-schedule-rest-smoke');
    const body = {
      recipientKey: 'user-rest-smoke',
      channel: 'in_app',
      topicIds: ['topic-z', 'topic-a', 'topic-a'],
      intervalSeconds: 1800,
      includeNoSignal: true,
      nextRunAt: '2026-06-06T02:00:00.000Z',
    };

    await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .send(body)
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send(body)
      .expect(201);

    assert(created.body.created === true, 'digest schedule REST create must return created=true');
    assert(created.body.schedule.tenantId === tenant, 'digest schedule REST create must preserve tenant scope');
    assert(created.body.schedule.workspaceId === workspace, 'digest schedule REST create must preserve workspace scope');
    assert(
      created.body.schedule.topicIds.join(',') === 'topic-a,topic-z',
      'digest schedule REST create must normalize topic ids',
    );

    const listed = await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .query({ limit: 1 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listed.body.schedules.length === 1, 'digest schedule REST list must return created schedule');
    assert(
      listed.body.schedules[0].id === created.body.schedule.id,
      'digest schedule REST list must preserve schedule id',
    );

    const fetched = await request(app.getHttpServer())
      .get(`/delivery/digest-schedules/${created.body.schedule.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(fetched.body.id === created.body.schedule.id, 'digest schedule REST get must return created schedule');
    assert(fetched.body.recipientKey === body.recipientKey, 'digest schedule REST get must preserve recipient key');

    console.log('Digest schedule REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
