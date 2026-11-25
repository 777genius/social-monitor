import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryDigestScheduleRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-digest-schedule.repository';
import { InMemoryDigestSourceReader } from '@social-monitor/delivery/adapters/source/in-memory-digest-source.reader';
import { DigestSchedule } from '@social-monitor/delivery/domain';
import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Scheduled digests (e2e)', () => {
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

  it('assembles due digest schedule and exposes generated digest through REST', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-digest-schedule-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-digest-schedule-e2e'));

    app.get(InMemoryDigestScheduleRepository).add(DigestSchedule.create({
      id: 'digest-schedule-e2e-1',
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email',
      interestIds: ['topic-scheduled-e2e'],
      intervalSeconds: 3600,
      includeNoSignal: false,
      nextRunAt: new Date('2026-06-06T01:00:00.000Z'),
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    app.get(InMemoryDigestSourceReader).addSummary({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-scheduled-e2e-1',
      interestId: 'topic-scheduled-e2e',
      sourceWindowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      sourceWindowEndedAt: new Date('2026-06-06T00:59:59.999Z'),
      signal: 'high',
    });

    const scheduled = await app.get(ScheduleDueDigestsUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    if (!scheduled.ok) {
      throw scheduled.error;
    }

    expect(scheduled.value).toMatchObject({
      evaluated: 1,
      assembled: 1,
      skipped: 0,
      digests: [
        {
          digestScheduleId: 'digest-schedule-e2e-1',
          created: true,
        },
      ],
    });

    const digest = scheduled.value.digests[0];

    if (digest === undefined) {
      throw new Error('Expected scheduled digest result');
    }

    const response = await request(app.getHttpServer())
      .get(`/delivery/digests/${digest.digestId}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(response.body).toMatchObject({
      id: digest.digestId,
      status: 'assembled',
      summaryIds: ['summary-scheduled-e2e-1'],
      window: {
        windowId: 'digest:2026-06-06T00:00:00.000Z:2026-06-06T01:00:00.000Z',
        startedAt: '2026-06-06T00:00:00.000Z',
        endedAt: '2026-06-06T01:00:00.000Z',
      },
    });
    expect((await app.get(InMemoryDigestScheduleRepository).findById({
      tenantId: tenant,
      workspaceId: workspace,
      digestScheduleId: 'digest-schedule-e2e-1',
    }))?.toSnapshot()).toMatchObject({
      nextRunAt: new Date('2026-06-06T02:00:00.000Z'),
    });
  });
});
