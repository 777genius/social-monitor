import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import {
  DELIVERY_NOTIFICATION_PREFERENCE_READER,
} from '@social-monitor/delivery/interfaces/rest/delivery-provider-tokens';
import type { NotificationPreferenceReaderPort } from '@social-monitor/delivery/ports';
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
    const tenant = tenantId('tenant-notification-preference-rest-smoke');
    const workspace = workspaceId('workspace-notification-preference-rest-smoke');
    const body = {
      recipientKey: 'user-rest-smoke',
      channel: 'email',
      allowed: false,
      reason: 'User disabled email notifications',
    } as const;

    await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .send(body)
      .expect(403);

    const suppressed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send(body)
      .expect(200);

    assert(suppressed.body.updated === true, 'notification preference REST set must return updated=true');
    assert(suppressed.body.preference.allowed === false, 'notification preference REST set must suppress delivery');
    assert(
      suppressed.body.preference.reason === 'User disabled email notifications',
      'notification preference REST set must preserve suppression reason',
    );

    const listed = await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: body.recipientKey, channel: body.channel })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listed.body.allowed === false, 'notification preference REST get must return suppression');

    const reader = app.get<NotificationPreferenceReaderPort>(DELIVERY_NOTIFICATION_PREFERENCE_READER);
    const sendDecision = await reader.getDeliveryPreference({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: body.recipientKey,
      channel: body.channel,
      resourceType: 'digest',
      resourceId: 'digest-rest-smoke',
    });
    assert(sendDecision.allowed === false, 'notification preference REST set must affect send-time reader');

    const allowed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        recipientKey: body.recipientKey,
        channel: body.channel,
        allowed: true,
      })
      .expect(200);

    assert(allowed.body.preference.allowed === true, 'notification preference REST set must allow delivery');
    assert(allowed.body.preference.reason === undefined, 'allowed notification preference must not expose stale reason');

    console.log('Notification preference REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
