import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { correlationId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { RecordRealtimeEventUseCase } from '@social-monitor/delivery/features/record-realtime-event/record-realtime-event.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Realtime event replay (e2e)', () => {
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

  it('replays tenant/workspace realtime events through REST resync endpoint', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-realtime-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-realtime-e2e'));
    const channel = 'interest:topic-realtime-e2e:summary-status';
    await app.get(RecordRealtimeEventUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel,
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: 'summary-1',
      correlationId: correlationId('realtime-correlation-1'),
      payload: {
        summaryId: 'summary-1',
        status: 'no_signal',
      },
    });

    const missingRole = await request(app.getHttpServer())
      .get(`/realtime/events?channel=${encodeURIComponent(channel)}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'realtime_events.read',
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/realtime/events?channel=${encodeURIComponent(channel)}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toEqual({
      events: [
        expect.objectContaining({
          protocolVersion: 1,
          eventType: 'summary.status.changed.v1',
          tenantId: tenant,
          workspaceId: workspace,
          channel,
          resourceType: 'summary',
          resourceId: 'summary-1',
          sequence: 1,
          payload: {
            summaryId: 'summary-1',
            status: 'no_signal',
          },
        }),
      ],
      resyncRequired: false,
    });
  });
});
