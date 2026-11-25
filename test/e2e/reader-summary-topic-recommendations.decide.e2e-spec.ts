import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';
import {
  MONITORING_SOURCE_BINDING_REPOSITORY,
} from '../../libs/monitoring/interfaces/rest/monitoring-provider-tokens';
import type { SourceBindingRepositoryPort } from '../../libs/monitoring/ports';
import { deterministicTestUuid } from './support/deterministic-test-uuid';

describe('Reader summary topic recommendations decision flow (e2e)', () => {
  let app: INestApplication;
  let sourceBindings: SourceBindingRepositoryPort;
  const originalSummaryModelProvider = process.env.SUMMARY_MODEL_PROVIDER;
  const originalReaderSummaryModelProvider =
    process.env.READER_SUMMARY_MODEL_PROVIDER;
  const originalReaderSummaryTopicLabeler =
    process.env.READER_SUMMARY_TOPIC_LABELER;

  beforeAll(async () => {
    process.env.SUMMARY_MODEL_PROVIDER = 'deterministic';
    process.env.READER_SUMMARY_MODEL_PROVIDER = 'deterministic';
    process.env.READER_SUMMARY_TOPIC_LABELER = 'deterministic';

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
    sourceBindings = app.get<SourceBindingRepositoryPort>(
      MONITORING_SOURCE_BINDING_REPOSITORY,
    );
  });

  afterAll(async () => {
    await app?.close();
    restoreEnv('SUMMARY_MODEL_PROVIDER', originalSummaryModelProvider);
    restoreEnv(
      'READER_SUMMARY_MODEL_PROVIDER',
      originalReaderSummaryModelProvider,
    );
    restoreEnv(
      'READER_SUMMARY_TOPIC_LABELER',
      originalReaderSummaryTopicLabeler,
    );
  });

  it('canonicalizes stale headline labels before applying and reverting source binding queries', async () => {
    const tenant = tenantId(deterministicTestUuid('tenant-topic-rec-decision-e2e'));
    const workspace = workspaceId(deterministicTestUuid('workspace-topic-rec-decision-e2e'));
    const rawTopicLabel =
      'The productivity stack many professionals rely on every';
    const canonicalTopicLabel = 'Productivity stack';
    const rawRecommendationId =
      'topic-rec:14:the productivity stack many professionals rely on every';
    const canonicalRecommendationId = 'topic-rec:14:productivity stack';
    const interest = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'topic-rec-decision-e2e-interest')
      .set('idempotency-key', 'topic-rec-decision-e2e-interest')
      .send({
        name: 'Topic Recommendation Decision E2E',
        query: 'productivity tools',
      })
      .expect(201);
    const bound = await request(app.getHttpServer())
      .post(`/interests/${interest.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-request-id', 'topic-rec-decision-e2e-bind-x')
      .set('idempotency-key', 'topic-rec-decision-e2e-bind-x')
      .send({
        providerKey: 'x-twitter',
        config: { query: 'productivity tools' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/reader-summary-topic-recommendations/${encodeURIComponent(
          rawRecommendationId,
        )}/decision`,
      )
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-user-id', 'topic-rec-decision-e2e-admin')
      .send({
        action: 'accept',
        topicLabel: rawTopicLabel,
        interestIds: [interest.body.interestId],
        providerKeys: ['x-twitter'],
        note: 'accept stale topic label',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          decisionStatus: 'accepted',
          decision: {
            recommendationId: canonicalRecommendationId,
            topicLabel: canonicalTopicLabel,
            status: 'accepted',
          },
          application: {
            status: 'applied',
            changedSourceBindingCount: 1,
          },
        });
        expect(
          response.body.application.sourceBindingUpdates[0].changedConfigPaths,
        ).toEqual(
          expect.arrayContaining([
            'promotedTopics',
            'searchQueries',
            'maxSearchQueries',
          ]),
        );
      });

    await expectBindingConfig({
      tenant,
      workspace,
      sourceBindingId: bound.body.sourceBindingId,
      contains: canonicalTopicLabel,
      excludes: rawTopicLabel,
    });

    await request(app.getHttpServer())
      .post(
        `/reader-summary-topic-recommendations/${encodeURIComponent(
          rawRecommendationId,
        )}/decision`,
      )
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-user-id', 'topic-rec-decision-e2e-admin')
      .send({
        action: 'undo',
        topicLabel: rawTopicLabel,
        note: 'undo stale topic label',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          decisionStatus: 'pending',
          application: { status: 'not_requested' },
          reversion: {
            status: 'reverted',
            revertedSourceBindingCount: 1,
          },
        });
      });

    await expectBindingConfig({
      tenant,
      workspace,
      sourceBindingId: bound.body.sourceBindingId,
      excludes: canonicalTopicLabel,
    });

    await request(app.getHttpServer())
      .post(
        `/reader-summary-topic-recommendations/${encodeURIComponent(
          rawRecommendationId,
        )}/decision`,
      )
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-user-id', 'topic-rec-decision-e2e-admin')
      .send({
        action: 'reject',
        topicLabel: rawTopicLabel,
        note: 'reject stale topic label',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          decisionStatus: 'rejected',
          decision: {
            recommendationId: canonicalRecommendationId,
            topicLabel: canonicalTopicLabel,
            status: 'rejected',
          },
          application: {
            status: 'not_requested',
            changedSourceBindingCount: 0,
          },
        });
      });

    await request(app.getHttpServer())
      .post(
        `/reader-summary-topic-recommendations/${encodeURIComponent(
          'topic-rec:14:the',
        )}/decision`,
      )
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .set('x-user-id', 'topic-rec-decision-e2e-admin')
      .send({
        action: 'accept',
        topicLabel: 'The',
        interestIds: [interest.body.interestId],
        providerKeys: ['x-twitter'],
        note: 'reject generic topic label',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'validation.failed',
        });
      });

    await expectBindingConfig({
      tenant,
      workspace,
      sourceBindingId: bound.body.sourceBindingId,
      excludes: 'The',
    });
  });

  async function expectBindingConfig(params: {
    readonly tenant: ReturnType<typeof tenantId>;
    readonly workspace: ReturnType<typeof workspaceId>;
    readonly sourceBindingId: string;
    readonly contains?: string;
    readonly excludes: string;
  }): Promise<void> {
    const binding = await sourceBindings.findById({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      sourceBindingId: params.sourceBindingId,
    });
    const config = binding?.toSnapshot().config;
    const serialized = JSON.stringify(config);

    expect(config).toBeDefined();
    if (params.contains !== undefined) {
      expect(serialized).toContain(params.contains);
    }
    expect(serialized).not.toContain(params.excludes);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
