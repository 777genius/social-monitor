import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '@social-monitor/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
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
    const tenant = tenantId('tenant-delivery-attempt-rest-smoke');
    const workspace = workspaceId('workspace-delivery-attempt-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const deliveryStatusSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Delivery attempt status reader',
      scopes: ['read:delivery_status'],
    });
    const wrongScopeSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Delivery attempt wrong reader',
      scopes: ['read:feed'],
    });

    const emptyList = await request(app.getHttpServer())
      .get('/delivery/attempts')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(emptyList.body.attempts.length === 0, 'delivery attempt REST list should start empty');

    const emptyListWithApiKey = await request(app.getHttpServer())
      .get('/delivery/attempts')
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      emptyListWithApiKey.body.attempts.length === 0,
      'read:delivery_status API key list should start empty',
    );

    const queued = await moduleRef.get(QueueDeliveryAttemptUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'digest:daily:webhook-endpoint-1',
      channel: 'webhook',
      recipientKey: 'webhook-endpoint-1',
      resourceType: 'digest',
      resourceId: 'digest-1',
      maxRetries: 3,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const listed = await request(app.getHttpServer())
      .get('/delivery/attempts')
      .query({ limit: 1 })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listed.body.attempts.length === 1, 'delivery attempt REST list must return queued attempt');
    assert(
      listed.body.attempts[0].id === queued.value.deliveryAttemptId,
      'delivery attempt REST list must preserve attempt id',
    );

    const listedWithApiKey = await request(app.getHttpServer())
      .get('/delivery/attempts')
      .query({ limit: 1 })
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      listedWithApiKey.body.attempts[0].id === queued.value.deliveryAttemptId,
      'read:delivery_status API key must list delivery attempts without workspace role',
    );

    await request(app.getHttpServer())
      .get('/delivery/attempts')
      .set(headers)
      .set('Authorization', `Bearer ${wrongScopeSecret}`)
      .expect(403);

    const fetched = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(fetched.body.id === queued.value.deliveryAttemptId, 'delivery attempt REST get must return attempt');

    const fetchedWithApiKey = await request(app.getHttpServer())
      .get(`/delivery/attempts/${queued.value.deliveryAttemptId}`)
      .set(headers)
      .set('Authorization', `Bearer ${deliveryStatusSecret}`)
      .expect(200);

    assert(
      fetchedWithApiKey.body.id === queued.value.deliveryAttemptId,
      'read:delivery_status API key must read one delivery attempt without workspace role',
    );

    const recorder = moduleRef.get(RecordDeliveryAttemptStateUseCase);
    const sending = await recorder.execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      nextState: 'sending',
    });

    if (!sending.ok) {
      throw sending.error;
    }

    const failed = await recorder.execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      nextState: 'failed_retryable',
      reason: 'Provider returned 429',
    });

    if (!failed.ok) {
      throw failed.error;
    }

    await request(app.getHttpServer())
      .post(`/delivery/attempts/${queued.value.deliveryAttemptId}/retry`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .send({
        content: {
          subject: 'Daily digest',
          body: 'Digest body',
        },
      })
      .expect(403);

    const retried = await request(app.getHttpServer())
      .post(`/delivery/attempts/${queued.value.deliveryAttemptId}/retry`)
      .set(headers)
      .set('x-workspace-role', 'member')
      .send({
        content: {
          subject: 'Daily digest',
          body: 'Digest body',
        },
      })
      .expect(200);

    assert(retried.body.attempt.state === 'delivered', 'delivery attempt REST retry must mark delivered');
    assert(retried.body.attempt.retryCount === 1, 'delivery attempt REST retry must preserve retry count');

    await request(app.getHttpServer())
      .post(`/delivery/attempts/${queued.value.deliveryAttemptId}/retry`)
      .set(headers)
      .set('x-workspace-role', 'member')
      .send({
        content: {
          body: 'Digest body',
        },
      })
      .expect(409);

    console.log('Delivery attempt REST smoke OK');
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
