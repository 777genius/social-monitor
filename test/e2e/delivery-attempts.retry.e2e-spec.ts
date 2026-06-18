import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryDeliveryProvider } from '@social-monitor/delivery/adapters/notification/in-memory-delivery.provider';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RetryDeliveryAttemptUseCase } from '@social-monitor/delivery/features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { DELIVERY_PROVIDERS } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Delivery retry orchestration (e2e)', () => {
  let app: INestApplication;
  let webhookProvider: InMemoryDeliveryProvider;

  beforeAll(async () => {
    webhookProvider = new InMemoryDeliveryProvider('webhook');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DELIVERY_PROVIDERS)
      .useValue([
        new InMemoryDeliveryProvider('in_app'),
        new InMemoryDeliveryProvider('email'),
        webhookProvider,
      ])
      .compile();

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

  it('retries retryable webhook failure and exposes delivered status', async () => {
    const tenant = tenantId('tenant-delivery-retry-e2e');
    const workspace = workspaceId('workspace-delivery-retry-e2e');
    webhookProvider.enqueueResult({
      accepted: false,
      retryable: true,
      reason: 'Webhook provider returned 429',
    });
    webhookProvider.enqueueResult({
      accepted: true,
      providerMessageId: 'provider-message-retry-e2e',
    });

    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'webhook:tenant-delivery-retry-e2e:user-1:digest-1',
      channel: 'webhook',
      recipientKey: 'webhook-endpoint-1',
      resourceType: 'digest',
      resourceId: 'digest-1',
      maxRetries: 2,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const send = await app.get(SendDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      content: {
        body: 'Digest body',
      },
    });

    if (!send.ok) {
      throw send.error;
    }

    const retry = await app.get(RetryDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      content: {
        body: 'Digest body',
      },
    });

    if (!retry.ok) {
      throw retry.error;
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
      channel: 'webhook',
      retryCount: 1,
      deliveredAt: expect.any(String),
    });
  });
});
