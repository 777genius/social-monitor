import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { FeedItem } from '@social-monitor/feed/domain';
import { tenantId, type TenantId, workspaceId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Summary feedback submission (e2e)', () => {
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

  it('records classified feedback with citation evidence and preserves idempotency', async () => {
    const tenant = tenantId('tenant-summary-feedback-submit-e2e');
    const workspace = workspaceId('workspace-summary-feedback-submit-e2e');
    const { summaryId, interestId, citation } = await createCitedSummary({
      app,
      tenant,
      workspace,
    });

    const missingRole = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-actor-id', 'beta-user-feedback-submit-e2e')
      .set('x-request-id', 'summary-feedback-submit-missing-role')
      .set('idempotency-key', 'summary-feedback-submit-missing-role')
      .send({
        category: 'bad_citation',
        rating: 2,
        citationId: citation.citationId,
        comment: 'Citation points to the right item but needs product review before beta expansion.',
      })
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'summary_feedback.create',
      },
    });

    const created = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-actor-id', 'beta-user-feedback-submit-e2e')
      .set('x-request-id', 'summary-feedback-submit-created')
      .set('idempotency-key', 'summary-feedback-submit-created')
      .send({
        category: 'bad_citation',
        rating: 2,
        citationId: citation.citationId,
        comment: 'Citation points to the right item but needs product review before beta expansion.',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      feedbackId: expect.any(String),
      created: true,
      category: 'bad_citation',
      triageOwner: 'summary-owner',
      evidence: {
        summaryId,
        interestId,
        citationId: citation.citationId,
        feedItemId: citation.feedItemId,
        sourceItemId: citation.sourceItemId,
        providerKey: citation.providerKey,
      },
      eligibleForEvalFixture: true,
      createdAt: expect.any(String),
    });

    const duplicated = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-actor-id', 'beta-user-feedback-submit-e2e')
      .set('x-request-id', 'summary-feedback-submit-created')
      .set('idempotency-key', 'summary-feedback-submit-created')
      .send({
        category: 'bad_citation',
        rating: 2,
        citationId: citation.citationId,
        comment: 'Citation points to the right item but needs product review before beta expansion.',
      })
      .expect(201);

    expect(duplicated.body).toMatchObject({
      feedbackId: created.body.feedbackId,
      created: false,
    });

    const listed = await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body.items).toEqual([
      expect.objectContaining({
        feedbackId: created.body.feedbackId,
        tenantId: tenant,
        workspaceId: workspace,
        summaryId,
        interestId,
        submittedBy: 'beta-user-feedback-submit-e2e',
        rating: 2,
        category: 'bad_citation',
        comment: 'Citation points to the right item but needs product review before beta expansion.',
        triageOwner: 'summary-owner',
        eligibleForEvalFixture: true,
        evidence: {
          summaryId,
          interestId,
          citationId: citation.citationId,
          feedItemId: citation.feedItemId,
          sourceItemId: citation.sourceItemId,
          providerKey: citation.providerKey,
        },
      }),
    ]);

    const invalidCitation = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-actor-id', 'beta-user-feedback-submit-e2e')
      .set('x-request-id', 'summary-feedback-submit-invalid-citation')
      .set('idempotency-key', 'summary-feedback-submit-invalid-citation')
      .send({
        category: 'bad_citation',
        rating: 1,
        citationId: 'citation-outside-summary',
        comment: 'This should not be accepted as summary feedback evidence.',
      })
      .expect(400);

    expect(invalidCitation.body).toMatchObject({
      code: 'validation.failed',
      detail: 'Feedback citation must belong to the summary',
      details: {
        summaryId,
        citationId: 'citation-outside-summary',
      },
    });
  });
});

type SummaryCitation = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
};

const createCitedSummary = async (params: {
  readonly app: INestApplication;
  readonly tenant: TenantId;
  readonly workspace: WorkspaceId;
}): Promise<{
  readonly summaryId: string;
  readonly interestId: string;
  readonly citation: SummaryCitation;
}> => {
  const interestId = 'topic-summary-feedback-submit-e2e';
  seedSummaryEvidence(params.app, params.tenant, params.workspace, interestId);

  const requested = await request(params.app.getHttpServer())
    .post(`/interests/${interestId}/summary-requests`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'member')
    .set('x-request-id', 'summary-feedback-submit-request')
    .set('idempotency-key', 'summary-feedback-submit-request')
    .expect(201);

  const executed = await params.app.get(ExecuteSummaryJobUseCase).execute({
    tenantId: params.tenant,
    workspaceId: params.workspace,
    summaryJobId: requested.body.summaryJobId as string,
  });

  if (!executed.ok || executed.value.summaryId === undefined || executed.value.status !== 'completed') {
    throw new Error('Expected summary execution to produce a completed cited summary');
  }

  const summary = await request(params.app.getHttpServer())
    .get(`/summaries/${executed.value.summaryId}`)
    .set('x-tenant-id', params.tenant)
    .set('x-workspace-id', params.workspace)
    .set('x-workspace-role', 'viewer')
    .expect(200);

  const citation = summary.body.citations[0] as SummaryCitation | undefined;
  if (citation === undefined) {
    throw new Error('Expected summary to expose citation evidence for feedback');
  }

  return {
    summaryId: executed.value.summaryId,
    interestId,
    citation,
  };
};

const seedSummaryEvidence = (
  app: INestApplication,
  tenant: TenantId,
  workspace: WorkspaceId,
  interestId: string,
): void => {
  const feedItems = app.get(InMemoryFeedItemReadRepository);
  const observedAt = new Date(Date.now() - 60_000);
  const publishedAt = new Date(observedAt.getTime() - 60_000);

  feedItems.upsert(FeedItem.publish({
    id: 'feed-summary-feedback-submit-e2e-1',
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceItemId: 'source-summary-feedback-submit-e2e-1',
    sourceBindingId: 'source-binding-summary-feedback-submit-e2e',
    providerKey: 'rss',
    canonicalUrl: 'https://example.test/summary-feedback/1',
    title: 'Beta feedback evidence source',
    bodyPreview: 'The summary feedback test needs citation-backed evidence for triage.',
    publishedAt,
    observedAt,
  }));
};
