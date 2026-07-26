import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Digest schedule management (e2e)', () => {
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

  it('creates, lists and reads digest schedules through REST with workspace authorization', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-digest-schedule-management-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-digest-schedule-management-e2e'));
    const createBody = {
      recipientKey: 'user-1',
      channel: 'in_app',
      interestIds: ['topic-b', 'topic-a', 'topic-a'],
      intervalSeconds: 3600,
      includeNoSignal: true,
      nextRunAt: '2026-06-06T02:00:00.000Z',
    };

    const denied = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .send(createBody)
      .expect(403);

    expect(denied.body).toMatchObject({
      code: 'authorization.denied',
      details: {
        action: 'digest_schedules.create',
      },
    });

    const created = await request(app.getHttpServer())
      .post('/delivery/digest-schedules')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send(createBody)
      .expect(201);

    expect(created.body).toMatchObject({
      created: true,
      schedule: {
        tenantId: tenant,
        workspaceId: workspace,
        recipientKey: 'user-1',
        channel: 'in_app',
        interestIds: ['topic-a', 'topic-b'],
        intervalSeconds: 3600,
        includeNoSignal: true,
        nextRunAt: '2026-06-06T02:00:00.000Z',
        status: 'enabled',
      },
    });
    expect(created.body.schedule.id).toEqual(expect.any(String));
    expect(created.body.schedule.createdAt).toEqual(expect.any(String));

    const listed = await request(app.getHttpServer())
      .get('/delivery/digest-schedules')
      .query({ limit: 1 })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body).toEqual({
      schedules: [
        expect.objectContaining({
          id: created.body.schedule.id,
          tenantId: tenant,
          workspaceId: workspace,
          interestIds: ['topic-a', 'topic-b'],
        }),
      ],
    });

    const fetched = await request(app.getHttpServer())
      .get(`/delivery/digest-schedules/${created.body.schedule.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(fetched.body).toMatchObject({
      id: created.body.schedule.id,
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      interestIds: ['topic-a', 'topic-b'],
    });
  });
});
