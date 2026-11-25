import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Delivery provider send (e2e)', () => {
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

  it('sends a queued email attempt through the placeholder provider and exposes delivered status', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-delivery-send-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-delivery-send-e2e'));
    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'email:tenant-delivery-send-e2e:user-1:digest-1',
      channel: 'email',
      recipientKey: 'user-1',
      resourceType: 'digest',
      resourceId: 'digest-1',
      maxRetries: 1,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const sent = await app.get(SendDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      content: {
        subject: 'Digest',
        body: 'Digest body',
      },
    });

    if (!sent.ok) {
      throw sent.error;
    }

    const response = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toMatchObject({
      id: queued.value.deliveryAttemptId,
      state: 'delivered',
      channel: 'email',
      sendingAt: expect.any(String),
      deliveredAt: expect.any(String),
    });
  });
});
