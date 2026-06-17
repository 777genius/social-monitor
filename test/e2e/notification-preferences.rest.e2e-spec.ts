import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { DeliveryRestModule } from '../../libs/delivery/interfaces/rest/delivery-rest.module';
import {
  DELIVERY_NOTIFICATION_PREFERENCE_READER,
} from '../../libs/delivery/interfaces/rest/delivery-provider-tokens';
import type { NotificationPreferenceReaderPort } from '../../libs/delivery/ports';

describe('Notification preferences API (e2e)', () => {
  let app: INestApplication;
  let preferenceReader: NotificationPreferenceReaderPort;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    preferenceReader = moduleRef
      .select(DeliveryRestModule)
      .get<NotificationPreferenceReaderPort>(DELIVERY_NOTIFICATION_PREFERENCE_READER, { strict: true });
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

  it('sets, reads and applies recipient/channel delivery preferences', async () => {
    const tenant = tenantId('tenant-notification-preference-e2e');
    const workspace = workspaceId('workspace-notification-preference-e2e');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const preference = {
      recipientKey: 'user-notification-preference-e2e',
      channel: 'email',
      allowed: false,
      reason: 'User disabled email notifications',
    } as const;

    await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .send(preference)
      .expect(403);

    const suppressed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'member')
      .send(preference)
      .expect(200);

    expect(suppressed.body).toMatchObject({
      updated: true,
      preference: {
        tenantId: tenant,
        workspaceId: workspace,
        recipientKey: preference.recipientKey,
        channel: 'email',
        allowed: false,
        reason: 'User disabled email notifications',
      },
    });

    const listed = await request(app.getHttpServer())
      .get('/delivery/notification-preferences')
      .query({ recipientKey: preference.recipientKey, channel: preference.channel })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body).toMatchObject({
      recipientKey: preference.recipientKey,
      channel: 'email',
      allowed: false,
      reason: 'User disabled email notifications',
    });

    await expect(preferenceReader.getDeliveryPreference({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: preference.recipientKey,
      channel: preference.channel,
      resourceType: 'digest',
      resourceId: 'digest-notification-preference-e2e',
    })).resolves.toMatchObject({
      allowed: false,
      reason: 'User disabled email notifications',
    });

    const allowed = await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'member')
      .send({
        recipientKey: preference.recipientKey,
        channel: preference.channel,
        allowed: true,
      })
      .expect(200);

    expect(allowed.body.preference).toMatchObject({
      recipientKey: preference.recipientKey,
      channel: 'email',
      allowed: true,
    });
    expect(allowed.body.preference.reason).toBeUndefined();

    await request(app.getHttpServer())
      .put('/delivery/notification-preferences')
      .set(headers)
      .set('x-workspace-role', 'member')
      .send({
        recipientKey: '',
        channel: 'email',
        allowed: false,
      })
      .expect(400);
  });
});
