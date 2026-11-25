import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApplyDeliverySuppressionUseCase } from '@social-monitor/delivery/features/apply-delivery-suppression/apply-delivery-suppression.use-case';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Delivery suppression policy (e2e)', () => {
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

  it('suppresses no-signal delivery and exposes suppression reason', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-delivery-suppression-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-delivery-suppression-e2e'));
    const queued = await app.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'summary:tenant-delivery-suppression-e2e:user-1:summary-1',
      channel: 'in_app',
      recipientKey: 'user-1',
      resourceType: 'summary',
      resourceId: 'summary-1',
    });

    if (!queued.ok) {
      throw queued.error;
    }

    await app.get(ApplyDeliverySuppressionUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      resourceSignal: 'no_signal',
      policy: {
        allowNoSignal: false,
        highSignalOnly: false,
        repeatedFailureSuppressed: false,
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toMatchObject({
      id: queued.value.deliveryAttemptId,
      state: 'suppressed',
      suppressionReason: 'No-signal resource suppressed by preference',
      suppressedAt: expect.any(String),
    });
  });
});
