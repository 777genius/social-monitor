import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryDigestSourceReader } from '@social-monitor/delivery/adapters/source/in-memory-digest-source.reader';
import { AssembleDigestUseCase } from '@social-monitor/delivery/features/assemble-digest/assemble-digest.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Digest provenance (e2e)', () => {
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

  it('assembles digest from scoped read models and exposes provenance through REST', async () => {
    const tenant = tenantId('tenant-digest-e2e');
    const workspace = workspaceId('workspace-digest-e2e');
    const sourceReader = app.get(InMemoryDigestSourceReader);

    sourceReader.addSummary({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-digest-e2e-1',
      topicId: 'topic-digest-e2e',
      sourceWindowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      sourceWindowEndedAt: new Date('2026-06-06T01:00:00.000Z'),
      signal: 'high',
    });
    sourceReader.addSummary({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: 'summary-digest-e2e-no-signal',
      topicId: 'topic-digest-e2e',
      sourceWindowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      sourceWindowEndedAt: new Date('2026-06-06T01:00:00.000Z'),
      signal: 'no_signal',
    });
    sourceReader.addFeedItem({
      tenantId: tenant,
      workspaceId: workspace,
      feedItemId: 'feed-digest-e2e-1',
      topicId: 'topic-digest-e2e',
      observedAt: new Date('2026-06-06T00:30:00.000Z'),
      signal: 'normal',
    });

    const assembled = await app.get(AssembleDigestUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email',
      topicIds: ['topic-digest-e2e'],
      windowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
      windowEndedAt: new Date('2026-06-06T02:00:00.000Z'),
      includeNoSignal: false,
    });

    if (!assembled.ok) {
      throw assembled.error;
    }

    const response = await request(app.getHttpServer())
      .get(`/delivery/digests/${assembled.value.digest.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(200);

    expect(response.body).toMatchObject({
      id: assembled.value.digest.id,
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-1',
      channel: 'email',
      status: 'assembled',
      summaryIds: ['summary-digest-e2e-1'],
      feedItemIds: ['feed-digest-e2e-1'],
      window: {
        windowId: 'digest:2026-06-06T00:00:00.000Z:2026-06-06T02:00:00.000Z',
        startedAt: '2026-06-06T00:00:00.000Z',
        endedAt: '2026-06-06T02:00:00.000Z',
      },
      provenance: [
        {
          resourceType: 'feed_item',
          resourceId: 'feed-digest-e2e-1',
          topicId: 'topic-digest-e2e',
          includedReason: 'within_window',
        },
        {
          resourceType: 'summary',
          resourceId: 'summary-digest-e2e-1',
          topicId: 'topic-digest-e2e',
          includedReason: 'high_signal',
        },
      ],
      contentHash: expect.any(String),
      assembledAt: expect.any(String),
    });
    expect(assembled.value.deliveryAttemptId).toEqual(expect.any(String));
  });
});
