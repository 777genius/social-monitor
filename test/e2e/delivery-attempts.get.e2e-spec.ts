import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Delivery attempt status (e2e)', () => {
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

  it('returns queued delivery attempt status through REST', async () => {
    const tenant = tenantId('tenant-delivery-e2e');
    const workspace = workspaceId('workspace-delivery-e2e');
    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'digest:tenant-delivery-e2e:user-1:window-1:hash-1',
      channel: 'email',
      recipientKey: 'user-1',
      resourceType: 'digest',
      resourceId: 'digest-window-1',
      maxRetries: 2,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const missingRole = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'delivery_attempts.read',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toEqual({
      id: queued.value.deliveryAttemptId,
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'digest:tenant-delivery-e2e:user-1:window-1:hash-1',
      channel: 'email',
      recipientKey: 'user-1',
      resourceType: 'digest',
      resourceId: 'digest-window-1',
      state: 'queued',
      queuedAt: expect.any(String),
      retryCount: 0,
      maxRetries: 2,
    });
  });
});
