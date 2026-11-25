import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { InMemorySummaryFeedbackRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-feedback.repository';
import { SummaryArtifact, SummaryFeedback } from '@social-monitor/summary/domain';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
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
    imports: [SummaryRestModule],
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
    const tenant = tenantId('tenant-summary-feedback-rest-smoke');
    const otherTenant = tenantId('tenant-summary-feedback-rest-other');
    const workspace = workspaceId('workspace-summary-feedback-rest-smoke');
    const summaryId = 'summary-feedback-rest-smoke';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const summaries = moduleRef.get(InMemorySummaryArtifactRepository);
    const feedback = moduleRef.get(InMemorySummaryFeedbackRepository);

    await summaries.save(createSummary({ tenantId: tenant, workspaceId: workspace, summaryId }));
    await summaries.save(createSummary({ tenantId: otherTenant, workspaceId: workspace, summaryId }));
    await feedback.save(createFeedback({
      id: 'feedback-rest-older',
      tenantId: tenant,
      workspaceId: workspace,
      summaryId,
      createdAt: new Date('2026-06-06T10:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-rest-newer',
      tenantId: tenant,
      workspaceId: workspace,
      summaryId,
      createdAt: new Date('2026-06-06T11:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-rest-other-workspace',
      tenantId: tenant,
      workspaceId: workspaceId('workspace-summary-feedback-rest-other'),
      summaryId,
      createdAt: new Date('2026-06-06T12:00:00.000Z'),
    }));
    await feedback.save(createFeedback({
      id: 'feedback-rest-other-tenant',
      tenantId: otherTenant,
      workspaceId: workspace,
      summaryId,
      createdAt: new Date('2026-06-06T13:00:00.000Z'),
    }));

    const firstPage = await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .query({ limit: 1 })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(firstPage.body.items.length === 1, 'summary feedback REST list must honor limit');
    assert(
      firstPage.body.items[0].feedbackId === 'feedback-rest-newer',
      'summary feedback REST list must sort newest feedback first',
    );
    assert(typeof firstPage.body.nextCursor === 'string', 'summary feedback REST list must expose next cursor');

    const secondPage = await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .query({ limit: 10, cursor: firstPage.body.nextCursor })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(secondPage.body.items.length === 1, 'summary feedback REST cursor must continue page');
    assert(
      secondPage.body.items[0].feedbackId === 'feedback-rest-older',
      'summary feedback REST cursor must not leak other workspace feedback',
    );
    assert(secondPage.body.nextCursor === undefined, 'summary feedback REST final page must omit cursor');

    const otherTenantPage = await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .query({ limit: 10 })
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      otherTenantPage.body.items.length === 1 &&
        otherTenantPage.body.items[0].feedbackId === 'feedback-rest-other-tenant',
      'summary feedback REST must keep same summary ids isolated by tenant',
    );

    await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .query({ limit: 0 })
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(400);

    await request(app.getHttpServer())
      .get(`/summaries/${summaryId}/feedback`)
      .set(headers)
      .expect(403);

    await request(app.getHttpServer())
      .get('/summaries/missing-summary-feedback-rest-smoke/feedback')
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(404);

    await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/regenerations`)
      .set(headers)
      .set('x-workspace-role', 'member')
      .expect(400);

    await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .set('x-actor-id', 'actor-summary-feedback-rest-smoke')
      .send({
        rating: 4,
        category: 'low_relevance',
        citationId: 'c1',
        comment: 'This was useful.',
      })
      .expect(400);

    const createdFeedback = await request(app.getHttpServer())
      .post(`/summaries/${summaryId}/feedback`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .set('x-actor-id', 'actor-summary-feedback-rest-smoke')
      .set('idempotency-key', 'feedback-rest-create-idempotency')
      .send({
        rating: 4,
        category: 'low_relevance',
        citationId: 'c1',
        comment: 'This was useful.',
      })
      .expect(201);

    assert(
      createdFeedback.body.created === true &&
        createdFeedback.body.category === 'low_relevance',
      'summary feedback REST create must accept a valid idempotency key',
    );

    console.log('Summary feedback REST smoke OK');
  } finally {
    await app.close();
  }
}

const createSummary = (params: {
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly summaryId: string;
}): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId: params.summaryId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: 'topic-summary-feedback-rest-smoke',
    sourceWindow: {
      windowId: `${params.summaryId}-window`,
      startedAt: new Date('2026-06-06T09:00:00.000Z'),
      endedAt: new Date('2026-06-06T09:05:00.000Z'),
      selectedFeedItemIds: ['feed-item-summary-feedback-rest'],
    },
    headline: 'Feedback REST summary',
    executiveSummary: 'A cited summary that can receive classified feedback.',
    keyPoints: [{ claim: 'A cited claim exists.', citationIds: ['c1'] }],
    risksAndUnknowns: [],
    sourceHighlights: [],
    citationMap: [{
      citationId: 'c1',
      feedItemId: 'feed-item-summary-feedback-rest',
      sourceItemId: 'source-item-summary-feedback-rest',
      providerKey: 'rss',
      field: 'title',
    }],
    qualityFlags: [],
    confidence: {
      level: 'medium',
      score: 0.66,
      rationale: 'Smoke fixture has one cited item.',
    },
    lineage: {
      promptVersion: 'summary.prompt.test.v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'model-test',
      providerVersion: 'provider-test',
      rulesVersion: 'rules-test',
      evalDatasetVersion: 'eval-test',
    },
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0,
    },
  });

const createFeedback = (params: {
  readonly id: string;
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly summaryId: string;
  readonly createdAt: Date;
}): SummaryFeedback =>
  SummaryFeedback.record({
    id: params.id,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    summaryId: params.summaryId,
    interestId: 'topic-summary-feedback-rest-smoke',
    idempotencyKey: `${params.id}-idempotency`,
    submittedBy: 'actor-summary-feedback-rest-smoke',
    rating: 2,
    category: 'wrong_fact',
    comment: 'The cited item does not support this exact claim.',
    evidence: {
      summaryId: params.summaryId,
      interestId: 'topic-summary-feedback-rest-smoke',
      citationId: 'c1',
      feedItemId: 'feed-item-summary-feedback-rest',
      sourceItemId: 'source-item-summary-feedback-rest',
      providerKey: 'rss',
    },
    triageOwner: 'summary-owner',
    eligibleForEvalFixture: true,
    createdAt: params.createdAt,
  });

void main();
