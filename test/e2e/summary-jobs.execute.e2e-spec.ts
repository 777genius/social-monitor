import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import { SummaryRestModule } from '../../libs/summary/interfaces/rest/summary-rest.module';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Summary job execution flow (e2e)', () => {
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

  it('executes a requested summary job through the model port and persists a no-signal artifact', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-summary-exec-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-summary-exec-e2e'));
    const requested = await request(app.getHttpServer())
      .post('/interests/topic-summary-exec-e2e/summary-requests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-exec-request-1')
      .set('idempotency-key', 'summary-exec-request-1')
      .expect(201);

    const result = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        summaryJobId: requested.body.summaryJobId,
        status: 'no_signal',
        summaryId: expect.any(String),
      },
    });

    if (!result.ok) {
      throw result.error;
    }

    expect(result.value.summaryId).toEqual(expect.any(String));
    const summaryId = result.value.summaryId;
    if (summaryId === undefined) {
      throw new Error('Expected summary artifact id');
    }

    const artifact = await app.get(InMemorySummaryArtifactRepository).findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId,
    });

    expect(artifact?.toSnapshot()).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'topic-summary-exec-e2e',
      qualityFlags: ['no_signal', 'limited_sources'],
      confidence: {
        level: 'none',
        score: 0,
      },
      noSignalReason: 'No eligible evidence items selected for this interest.',
    });
    expect(app.get(InMemorySummaryEventPublisher).all()).toEqual([
      expect.objectContaining({
        eventType: 'summary.ready',
        schemaVersion: 1,
        tenantId: tenant,
        workspaceId: workspace,
        payload: expect.objectContaining({
          summaryJobId: requested.body.summaryJobId,
          summaryId: result.value.summaryId,
          interestId: 'topic-summary-exec-e2e',
          status: 'no_signal',
        }),
      }),
    ]);

    const metrics = app.select(SummaryRestModule).get(InMemoryMetricsRecorder, { strict: true });
    expect(
      metrics.counterValue('summary_model_requests_total', {
        model: 'summary-fake-v1',
        provider: 'deterministic-local',
        status: 'started',
      }),
    ).toBe(1);
    expect(
      metrics.counterValue('summary_model_requests_total', {
        model: 'summary-fake-v1',
        provider: 'deterministic-local',
        status: 'succeeded',
      }),
    ).toBe(1);
    expect(
      metrics.counterValue('summary_model_tokens_total', {
        model: 'summary-fake-v1',
        provider: 'deterministic-local',
        token_type: 'input',
      }),
    ).toBeGreaterThan(0);
    expect(
      metrics.counterValue('summary_model_tokens_total', {
        model: 'summary-fake-v1',
        provider: 'deterministic-local',
        token_type: 'output',
      }),
    ).toBe(48);
    expect(metrics.counters('summary_model_estimated_cost_usd')).toContainEqual(
      expect.objectContaining({
        labels: {
          model: 'summary-fake-v1',
          provider: 'deterministic-local',
        },
        value: 0,
      }),
    );
  });
});
