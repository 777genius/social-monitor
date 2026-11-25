import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryNotificationPreferenceReader } from '@social-monitor/delivery/adapters/preferences/in-memory-notification-preference.reader';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Delivery preferences before send (e2e)', () => {
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

  it('suppresses queued delivery when recipient disables the channel before send', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-delivery-preference-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-delivery-preference-e2e'));

    app.get(InMemoryNotificationPreferenceReader).suppressRecipientChannel({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email',
      reason: 'Email notifications disabled by preference',
    });

    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'email:tenant-delivery-preference-e2e:user-1:digest-1',
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
      state: 'suppressed',
      channel: 'email',
      suppressionReason: 'Email notifications disabled by preference',
      suppressedAt: expect.any(String),
    });
  });
});
