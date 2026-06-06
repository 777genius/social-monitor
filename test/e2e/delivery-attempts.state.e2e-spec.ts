import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '@social-monitor/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Delivery attempt state transitions (e2e)', () => {
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

  it('updates delivery attempt state internally and exposes terminal status through REST', async () => {
    const tenant = tenantId('tenant-delivery-state-e2e');
    const workspace = workspaceId('workspace-delivery-state-e2e');
    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'webhook:tenant-delivery-state-e2e:user-1:window-1:hash-1',
      channel: 'webhook',
      recipientKey: 'webhook-endpoint-1',
      resourceType: 'digest',
      resourceId: 'digest-window-1',
      maxRetries: 0,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    await app.get(RecordDeliveryAttemptStateUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      nextState: 'sending',
    });
    await app.get(RecordDeliveryAttemptStateUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      nextState: 'failed_terminal',
      reason: 'Webhook endpoint returned 500',
    });

    const response = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(response.body).toMatchObject({
      id: queued.value.deliveryAttemptId,
      state: 'failed_terminal',
      channel: 'webhook',
      retryCount: 1,
      maxRetries: 0,
      failureReason: 'Webhook endpoint returned 500',
      failedAt: expect.any(String),
    });
  });
});
