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
    const otherTenant = tenantId('tenant-notification-preference-rest-other');
    const workspace = workspaceId('workspace-notification-preference-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const deliveryReadSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Notification preference reader',
      scopes: ['read:delivery_status'],
    });
    const deliveryWriteSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Notification preference writer',
      scopes: ['write:delivery_status'],
    });
    const wrongScopeSecret = await createApiKey({
      server: app.getHttpServer(),
      tenant,
      workspace,
      name: 'Notification preference wrong scope',
      scopes: ['read:feed'],
    });
    const body = {
      recipientKey: 'user-rest-smoke',
      channel: 'email',
      allowed: false,
      reason: 'User disabled email notifications',
    } as const;

    await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .send(body)
      .expect(403);

    await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('Authorization', `Bearer ${deliveryReadSecret}`)
      .send(body)
      .expect(403);

    const suppressed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'member')
      .send(body)
      .expect(200);

    assert(suppressed.body.updated === true, 'notification preference REST set must return updated=true');
    assert(suppressed.body.preference.allowed === false, 'notification preference REST set must suppress delivery');
    assert(
      suppressed.body.preference.reason === 'User disabled email notifications',
      'notification preference REST set must preserve suppression reason',
    );

    const otherTenantAllowed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'member')
      .send({
        recipientKey: body.recipientKey,
        channel: body.channel,
        allowed: true,
      })
      .expect(200);

    assert(
      otherTenantAllowed.body.preference.allowed === true,
      'notification preference REST set must allow the same recipient in another tenant',
    );

    const listed = await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: body.recipientKey, channel: body.channel })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(listed.body.allowed === false, 'notification preference REST get must return suppression');

    const otherTenantListed = await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: body.recipientKey, channel: body.channel })
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      otherTenantListed.body.allowed === true,
      'notification preference REST get must keep same recipient/channel isolated by tenant',
    );

    const listedWithApiKey = await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: body.recipientKey, channel: body.channel })
      .set(headers)
      .set('Authorization', `Bearer ${deliveryReadSecret}`)
      .expect(200);

    assert(
      listedWithApiKey.body.allowed === false,
      'read:delivery_status API key must get notification preferences without workspace role',
    );

    await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: body.recipientKey, channel: body.channel })
      .set(headers)
      .set('Authorization', `Bearer ${wrongScopeSecret}`)
      .expect(403);

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
      .set(headers)
      .set('Authorization', `Bearer ${deliveryWriteSecret}`)
      .send({
        recipientKey: body.recipientKey,
        channel: body.channel,
        allowed: true,
      })
      .expect(200);

    assert(allowed.body.preference.allowed === true, 'notification preference REST set must allow delivery');
    assert(allowed.body.preference.reason === undefined, 'allowed notification preference must not expose stale reason');
    assert(
      allowed.body.preference.recipientKey === body.recipientKey,
      'write:delivery_status API key must set notification preferences without workspace role',
    );

    console.log('Notification preference REST smoke OK');
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
