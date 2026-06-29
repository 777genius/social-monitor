import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary ready realtime fanout (e2e)', () => {
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

  it('projects summary.ready into realtime summary status replay', async () => {
    const tenant = tenantId('tenant-summary-realtime-e2e');
    const workspace = workspaceId('workspace-summary-realtime-e2e');
    const interestId = 'topic-summary-realtime-e2e';
    const requested = await request(app.getHttpServer())
      .post(`/interests/${interestId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-realtime-request-1')
      .set('idempotency-key', 'summary-realtime-request-1')
      .expect(201);
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId,
    });

    if (!executed.ok) {
      throw executed.error;
    }

    const summaryReadyEvent = app.get(InMemorySummaryEventPublisher).all()[0];
    if (summaryReadyEvent === undefined) {
      throw new Error('Expected summary.ready event');
    }

    const projected = await app.get(ProjectSummaryReadyEventUseCase).execute({
      event: {
        ...summaryReadyEvent,
        payload: {
          summaryJobId: summaryReadyEvent.payload.summaryJobId as string,
          summaryId: summaryReadyEvent.payload.summaryId as string,
          tenantId: tenant,
          workspaceId: workspace,
          interestId,
          status: 'no_signal',
        },
      },
    });

    expect(projected.ok).toBe(true);

    const channel = `interest:${interestId}:summary-status`;
    const replay = await request(app.getHttpServer())
      .get(`/realtime/events?channel=${encodeURIComponent(channel)}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(replay.body).toEqual({
      events: [
        expect.objectContaining({
          eventType: 'summary.status.changed.v1',
          channel,
          resourceType: 'summary',
          resourceId: executed.value.summaryId,
          payload: {
            summaryJobId: requested.body.summaryJobId,
            summaryId: executed.value.summaryId,
            tenantId: tenant,
            workspaceId: workspace,
            interestId,
            status: 'no_signal',
          },
        }),
      ],
      resyncRequired: false,
    });
  });
});
