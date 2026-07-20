import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ReaderSummaryArtifact,
  ReaderSummaryJob,
} from '@social-monitor/summary/domain';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import {
  READER_SUMMARY_ARTIFACT_REPOSITORY,
  READER_SUMMARY_JOB_REPOSITORY,
  READER_SUMMARY_PUBLICATION,
} from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPublicationPort,
} from '@social-monitor/summary/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';
import {
  assert,
  assertReaderSummaryJobStatus,
  assertReaderSummaryPeriod,
  assertReaderSummaryQualityRejectedJobStatus,
  assertReaderSummaryQualityRejectionDebug,
  assertReaderSummaryResponse,
  readerSummaryRestSmokeContent,
  type ReaderSummaryJobStatusResponseBody,
  type ReaderSummaryListResponseBody,
  type ReaderSummaryQualityRejectionBody,
  type ReaderSummaryResponseBody,
  type RequestReaderSummaryResponseBody,
  requireString,
  requireValue,
} from './lib/reader-summary-rest-smoke-contract';
import {
  dailyGitHubProjectionFixture,
  publishFixture,
  requireNotApplicableProjection,
  requireVerifiedProjection,
} from './lib/reader-summary-rest-smoke-publication';

async function main(): Promise<void> {
  process.env.READER_SUMMARY_MODEL_PROVIDER = 'deterministic';
  process.env.READER_SUMMARY_TOPIC_LABELER = 'deterministic';

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
    const tenant = tenantId('tenant-readerSummary-rest-smoke');
    const otherTenant = tenantId('tenant-readerSummary-rest-other');
    const workspace = workspaceId('workspace-readerSummary-rest-smoke');
    const otherWorkspace = workspaceId('workspace-readerSummary-rest-other');
    const userId = 'user-readerSummary-rest-smoke';
    const readerSummaryId = 'readerSummary-rest-smoke-1';
    const weeklyReaderSummaryId = 'readerSummary-rest-smoke-weekly';
    const monthlyReaderSummaryId = 'readerSummary-rest-smoke-monthly';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'viewer',
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };
    const repository = moduleRef.get<ReaderSummaryArtifactRepositoryPort>(
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      { strict: false },
    );
    const readerSummaryJobs = moduleRef.get<ReaderSummaryJobRepositoryPort>(
      READER_SUMMARY_JOB_REPOSITORY,
      { strict: false },
    );
    const publications = moduleRef.get<ReaderSummaryPublicationPort>(
      READER_SUMMARY_PUBLICATION,
      { strict: false },
    );
    const githubProjection = dailyGitHubProjectionFixture();

    const dailyArtifact = ReaderSummaryArtifact.create({
      schemaVersion: 'reader_summary.artifact.v1',
      readerSummaryId: readerSummaryId,
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: 'workspace' },
      period: {
        cadence: 'daily',
        startedAt: new Date('2026-06-23T00:00:00.000Z'),
        endedAt: new Date('2026-06-24T00:00:00.000Z'),
        timezone: 'UTC',
        periodKey:
          'daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC',
      },
      userId,
      sourceWindow: {
        windowId: 'workspace:readerSummary-rest-smoke',
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
        selectedFeedItemIds: [
          'feed-reddit',
          'feed-github',
          ...githubProjection.items.map((item) => item.feedItemId),
        ],
        storyClusterIds: ['story:ai-tooling'],
      },
      storyClusters: [
        {
          id: 'story:ai-tooling',
          storyKey: 'url:example.com/ai-tooling',
          rankingPolicyVersion: 'story_ranking_v1',
          representativeFeedItemId: 'feed-reddit',
          duplicateFeedItemIds: ['feed-github'],
          interestIds: ['topic-ai', 'topic-github'],
          providerKeys: ['reddit', 'github-repo-radar'],
          score: 2.4,
          signalBreakdown: {
            baseScore: 1,
            crossProviderSupport: 0.7,
            sameProviderSupport: 0,
            providerDiversityBoost: 0.5,
            interestDiversityBoost: 0.2,
            freshnessBoost: 0.3,
            totalScore: 2.4,
          },
          observedAtRange: {
            startedAt: new Date('2026-06-23T08:00:00.000Z'),
            endedAt: new Date('2026-06-23T08:30:00.000Z'),
          },
          whyImportant: [
            'The same AI tooling story is supported by Reddit and GitHub evidence.',
          ],
        },
      ],
      contextArtifacts: [
        {
          artifactId: 'memory-context-1',
          scope: { type: 'workspace' },
          period: {
            cadence: 'daily',
            startedAt: new Date('2026-06-23T00:00:00.000Z'),
            endedAt: new Date('2026-06-24T00:00:00.000Z'),
            timezone: 'UTC',
            periodKey:
              'daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC',
          },
          summaryText:
            'User prefers practical AI tooling signals with source links and growth metrics.',
          generatedAt: new Date('2026-06-23T07:55:00.000Z'),
          freshness: 'fresh',
        },
      ],
      personalization: {
        memoryGuidanceStatus: 'available',
        memoryGuidanceApplied: true,
        providerPreferenceCount: 2,
        keywordPreferenceCount: 3,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: [
          'provider:reddit',
          'provider:github-repo-radar',
          'keyword:agent tooling',
        ],
      },
      headline: 'AI tooling signal grows across sources',
      executiveSummary:
        'A practical AI tooling story is repeating across Reddit discussion and GitHub repository growth.',
      content: {
        ...readerSummaryRestSmokeContent(),
        selectedPosts: githubProjection.selectedPosts,
      },
      topStories: [
        {
          storyClusterId: 'story:ai-tooling',
          title: 'AI tooling signal repeats across Reddit and GitHub',
          summary:
            'Reddit discussion and repo-radar evidence point to the same agent tooling theme.',
          interestIds: ['topic-ai', 'topic-github'],
          providerKeys: ['reddit', 'github-repo-radar'],
          citationIds: ['citation-reddit', 'citation-github'],
        },
      ],
      interestHighlights: [
        {
          interestId: 'topic-ai',
          title: 'Agent tooling is the strongest AI topic',
          summary:
            'The summary is backed by a Reddit source and a GitHub repo-radar source.',
          citationIds: ['citation-reddit', 'citation-github'],
        },
      ],
      repeatedSignals: [
        {
          storyClusterId: 'story:ai-tooling',
          title: 'Agent tooling repeated across monitored topics',
          interestIds: ['topic-ai', 'topic-github'],
          citationIds: ['citation-reddit', 'citation-github'],
        },
      ],
      risksAndUnknowns: [
        {
          description:
            'The trend still needs a later scan to confirm whether attention persists.',
          citationIds: ['citation-github'],
          reason: 'insufficient_evidence',
        },
      ],
      citationMap: [
        {
          citationId: 'citation-reddit',
          feedItemId: 'feed-reddit',
          sourceItemId: 'source-reddit',
          providerKey: 'reddit',
          field: 'title',
          canonicalUrl: 'https://www.reddit.com/r/LocalLLaMA/comments/example',
        },
        {
          citationId: 'citation-github',
          feedItemId: 'feed-github',
          sourceItemId: 'source-github',
          providerKey: 'github-repo-radar',
          field: 'canonicalUrl',
          canonicalUrl: 'https://github.com/openai/codex',
        },
        ...githubProjection.citations,
      ],
      qualityFlags: [],
      confidence: {
        level: 'high',
        score: 0.86,
        rationale:
          'The story has cross-provider support, direct links and personalization context.',
      },
      lineage: {
        promptVersion: 'reader-summary.prompt.rest-smoke.v1',
        schemaVersion: 'reader_summary.artifact.v1',
        modelVersion: 'deterministic-rest-smoke',
        providerVersion: 'fixture',
        rulesVersion: 'reader_summary.rules.rest-smoke.v1',
        evalDatasetVersion: 'reader_summary.eval.rest-smoke.v1',
        rankingPolicyVersion: 'story_ranking_v1',
      },
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        estimatedCostUsd: 0,
      },
    });
    const dailyProjectionAudit = requireVerifiedProjection(
      dailyArtifact,
      githubProjection,
    );
    await publishFixture({
      artifact: dailyArtifact,
      projectionAudit: dailyProjectionAudit,
      repository,
      jobs: readerSummaryJobs,
      publications,
      jobId: 'readerSummary-rest-smoke-daily-publication-job',
      requestedAt: new Date('2026-06-23T08:35:00.000Z'),
      completedAt: new Date('2026-06-23T08:36:00.000Z'),
    });

    const rejectedReaderSummaryId = 'readerSummary-rest-smoke-rejected';
    const rejectedJobId = 'readerSummary-rest-smoke-quality-rejected-job';
    await repository.save(
      ReaderSummaryArtifact.create({
        ...dailyArtifact.toSnapshot(),
        readerSummaryId: rejectedReaderSummaryId,
        headline: 'Rejected reader summary smoke artifact',
        content: {
          ...readerSummaryRestSmokeContent(),
          headline: 'Rejected reader summary smoke artifact',
        },
      }),
      {
        publicationDecision: {
          status: 'rejected',
          qualityPassed: false,
          canonicalScore: 0.2,
          shadow: {
            mode: 'shadow',
            policyVersion: 'reader_summary_publication_shadow_v1',
            riskScore: 0.7,
            signals: [
              {
                code: 'single_source',
                score: 0.7,
                reason:
                  'Selected evidence comes from a single provider family.',
              },
            ],
          },
          reasonCodes: ['top_read_ineligible_source'],
          reasons: ['Top read references ineligible evidence.'],
          findings: [
            {
              code: 'top_read_ineligible_source',
              reason: 'Top read references ineligible evidence.',
              topReadTitle: 'OpenAI Codex is a high-signal AI tooling read',
              citationId: 'citation-github',
              feedItemId: 'feed-github',
              sourceItemId: 'source-github',
              providerKey: 'github-repo-radar',
              canonicalUrl: 'https://github.com/openai/codex',
            },
          ],
        },
      },
    );
    await readerSummaryJobs.save(
      ReaderSummaryJob.request({
        id: rejectedJobId,
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: 'workspace' },
        period: dailyArtifact.toSnapshot().period,
        idempotencyKey: 'readerSummary-rest-smoke-quality-rejected',
        requestedAt: new Date('2026-06-23T08:40:00.000Z'),
      })
        .start({ startedAt: new Date('2026-06-23T08:41:00.000Z') })
        .rejectForQuality({
          rejectedAt: new Date('2026-06-23T08:42:00.000Z'),
          readerSummaryId: rejectedReaderSummaryId,
          failureReason:
            'Reader summary artifact failed pre-publish quality gate.',
        }),
    );

    const baseArtifact = dailyArtifact.toSnapshot();
    const nonDailyCitationMap = baseArtifact.citationMap.filter(
      (citation) => citation.providerKey !== 'github-trending-page',
    );
    const nonDailySelectedFeedItemIds =
      baseArtifact.sourceWindow.selectedFeedItemIds.filter(
        (feedItemId) => !feedItemId.startsWith('github-trending-feed-'),
      );
    const weeklyArtifact = ReaderSummaryArtifact.create({
      ...baseArtifact,
      readerSummaryId: weeklyReaderSummaryId,
      period: {
        cadence: 'weekly',
        startedAt: new Date('2026-06-15T00:00:00.000Z'),
        endedAt: new Date('2026-06-22T00:00:00.000Z'),
        timezone: 'UTC',
        periodKey:
          'weekly:2026-06-15T00:00:00.000Z:2026-06-22T00:00:00.000Z:UTC',
      },
      sourceWindow: {
        ...baseArtifact.sourceWindow,
        windowId: 'workspace:readerSummary-rest-smoke-weekly',
        startedAt: new Date('2026-06-16T08:00:00.000Z'),
        endedAt: new Date('2026-06-21T08:30:00.000Z'),
        selectedFeedItemIds: nonDailySelectedFeedItemIds,
      },
      storyClusters: baseArtifact.storyClusters.map((cluster) => ({
        ...cluster,
        observedAtRange: {
          startedAt: new Date('2026-06-16T08:00:00.000Z'),
          endedAt: new Date('2026-06-21T08:30:00.000Z'),
        },
      })),
      content: { ...baseArtifact.content!, selectedPosts: [] },
      citationMap: nonDailyCitationMap,
      headline: 'Weekly AI tooling reader summary',
    });
    await publishFixture({
      artifact: weeklyArtifact,
      projectionAudit: requireNotApplicableProjection(weeklyArtifact),
      repository,
      jobs: readerSummaryJobs,
      publications,
      jobId: 'readerSummary-rest-smoke-weekly-publication-job',
      requestedAt: new Date('2026-06-22T08:35:00.000Z'),
      completedAt: new Date('2026-06-22T08:36:00.000Z'),
    });

    const monthlyArtifact = ReaderSummaryArtifact.create({
      ...baseArtifact,
      readerSummaryId: monthlyReaderSummaryId,
      period: {
        cadence: 'monthly',
        startedAt: new Date('2026-06-01T00:00:00.000Z'),
        endedAt: new Date('2026-07-01T00:00:00.000Z'),
        timezone: 'UTC',
        periodKey:
          'monthly:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z:UTC',
      },
      sourceWindow: {
        ...baseArtifact.sourceWindow,
        windowId: 'workspace:readerSummary-rest-smoke-monthly',
        startedAt: new Date('2026-06-23T08:00:00.000Z'),
        endedAt: new Date('2026-06-23T08:30:00.000Z'),
        selectedFeedItemIds: nonDailySelectedFeedItemIds,
      },
      content: { ...baseArtifact.content!, selectedPosts: [] },
      citationMap: nonDailyCitationMap,
      headline: 'Monthly AI tooling reader summary',
    });
    await publishFixture({
      artifact: monthlyArtifact,
      projectionAudit: requireNotApplicableProjection(monthlyArtifact),
      repository,
      jobs: readerSummaryJobs,
      publications,
      jobId: 'readerSummary-rest-smoke-monthly-publication-job',
      requestedAt: new Date('2026-07-01T08:35:00.000Z'),
      completedAt: new Date('2026-07-01T08:36:00.000Z'),
    });

    const listResponse = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({
        scopeType: 'workspace',
        providerKey: 'reddit',
        userId,
        memoryGuidanceApplied: 'true',
        cadence: 'daily',
        periodStartedAt: '2026-06-23T00:00:00.000Z',
        periodEndedAt: '2026-06-24T00:00:00.000Z',
        timezone: 'UTC',
        limit: '5',
      })
      .set(headers)
      .expect(200);
    const listBody = listResponse.body as ReaderSummaryListResponseBody;

    assert(
      Array.isArray(listBody.items) && listBody.items.length === 1,
      'reader-summaries REST list must return the seeded personalized artifact',
    );
    assertReaderSummaryResponse(
      requireValue(
        listBody.items[0],
        'reader-summaries REST list item is missing',
      ),
      readerSummaryId,
      'daily',
    );

    const weeklyListResponse = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({
        scopeType: 'workspace',
        cadence: 'weekly',
        periodStartedAt: '2026-06-15T00:00:00.000Z',
        periodEndedAt: '2026-06-22T00:00:00.000Z',
        timezone: 'UTC',
        limit: '5',
      })
      .set(headers)
      .expect(200);
    const weeklyListBody =
      weeklyListResponse.body as ReaderSummaryListResponseBody;
    assert(
      weeklyListBody.items.length === 1,
      'reader-summaries REST list must filter weekly artifacts by period',
    );
    assertReaderSummaryResponse(
      requireValue(
        weeklyListBody.items[0],
        'weekly reader-summaries REST list item is missing',
      ),
      weeklyReaderSummaryId,
      'weekly',
    );

    const monthlyListResponse = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({
        scopeType: 'workspace',
        cadence: 'monthly',
        periodStartedAt: '2026-06-01T00:00:00.000Z',
        periodEndedAt: '2026-07-01T00:00:00.000Z',
        timezone: 'UTC',
        limit: '5',
      })
      .set(headers)
      .expect(200);
    const monthlyListBody =
      monthlyListResponse.body as ReaderSummaryListResponseBody;
    assert(
      monthlyListBody.items.length === 1,
      'reader-summaries REST list must filter monthly artifacts by period',
    );
    assertReaderSummaryResponse(
      requireValue(
        monthlyListBody.items[0],
        'monthly reader-summaries REST list item is missing',
      ),
      monthlyReaderSummaryId,
      'monthly',
    );

    const otherTenantListResponse = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({
        scopeType: 'workspace',
        providerKey: 'reddit',
        userId,
        memoryGuidanceApplied: 'true',
        cadence: 'daily',
        periodStartedAt: '2026-06-23T00:00:00.000Z',
        periodEndedAt: '2026-06-24T00:00:00.000Z',
        timezone: 'UTC',
        limit: '5',
      })
      .set(otherTenantHeaders)
      .expect(200);

    assert(
      (otherTenantListResponse.body as ReaderSummaryListResponseBody).items
        .length === 0,
      'reader-summaries REST list must not return artifacts from another tenant',
    );

    const detailResponse = await request(app.getHttpServer())
      .get(`/reader-summaries/${readerSummaryId}`)
      .set(headers)
      .expect(200);

    assertReaderSummaryResponse(
      detailResponse.body as ReaderSummaryResponseBody,
      readerSummaryId,
      'daily',
    );

    const weeklyDetailResponse = await request(app.getHttpServer())
      .get(`/reader-summaries/${weeklyReaderSummaryId}`)
      .set(headers)
      .expect(200);
    assertReaderSummaryResponse(
      weeklyDetailResponse.body as ReaderSummaryResponseBody,
      weeklyReaderSummaryId,
      'weekly',
    );

    const monthlyDetailResponse = await request(app.getHttpServer())
      .get(`/reader-summaries/${monthlyReaderSummaryId}`)
      .set(headers)
      .expect(200);
    assertReaderSummaryResponse(
      monthlyDetailResponse.body as ReaderSummaryResponseBody,
      monthlyReaderSummaryId,
      'monthly',
    );

    const readerSummaryRequestHeaders = {
      ...headers,
      'x-workspace-role': 'member',
      'idempotency-key': 'readerSummary-rest-smoke-request',
    };
    const requestResponse = await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set(readerSummaryRequestHeaders)
      .send({
        scope: { type: 'workspace' },
        userId,
      })
      .expect(201);
    const requestBody =
      requestResponse.body as RequestReaderSummaryResponseBody;
    const readerSummaryJobId = requireString(
      requestBody.readerSummaryJobId,
      'readerSummary request REST must return a readerSummaryJobId',
    );

    assert(
      requestBody.created === true && requestBody.status === 'requested',
      'readerSummary request REST must create a requested job',
    );
    assertReaderSummaryPeriod(
      requestBody.period,
      'daily',
      'readerSummary request REST must expose daily default period',
    );

    const replayResponse = await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set(readerSummaryRequestHeaders)
      .send({
        scope: { type: 'workspace' },
        userId,
      })
      .expect(201);
    const replayBody = replayResponse.body as RequestReaderSummaryResponseBody;

    assert(
      replayBody.readerSummaryJobId === readerSummaryJobId &&
        replayBody.created === false,
      'readerSummary request REST must replay idempotent requests without creating another job',
    );

    const weeklyRequestResponse = await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set({
        ...readerSummaryRequestHeaders,
        'idempotency-key': 'readerSummary-rest-smoke-request-weekly',
      })
      .send({
        scope: { type: 'workspace' },
        userId,
        cadence: 'weekly',
      })
      .expect(201);
    assertReaderSummaryPeriod(
      (weeklyRequestResponse.body as RequestReaderSummaryResponseBody).period,
      'weekly',
      'readerSummary request REST must expose weekly default period',
    );

    const monthlyRequestResponse = await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set({
        ...readerSummaryRequestHeaders,
        'idempotency-key': 'readerSummary-rest-smoke-request-monthly',
      })
      .send({
        scope: { type: 'workspace' },
        userId,
        cadence: 'monthly',
        period: {
          startedAt: '2026-06-01T00:00:00.000Z',
          endedAt: '2026-07-01T00:00:00.000Z',
          timezone: 'UTC',
        },
      })
      .expect(201);
    assertReaderSummaryPeriod(
      (monthlyRequestResponse.body as RequestReaderSummaryResponseBody).period,
      'monthly',
      'readerSummary request REST must expose requested monthly period',
    );

    await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set(readerSummaryRequestHeaders)
      .send({
        scope: { type: 'interest', interestId: 'topic-readerSummary-rest-smoke' },
        userId,
      })
      .expect(409);

    const statusResponse = await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${readerSummaryJobId}/status`)
      .set(headers)
      .expect(200);

    assertReaderSummaryJobStatus(
      statusResponse.body as ReaderSummaryJobStatusResponseBody,
      readerSummaryJobId,
      'daily',
    );

    await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${readerSummaryJobId}/status`)
      .set({
        ...headers,
        'x-workspace-id': otherWorkspace,
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${readerSummaryJobId}/status`)
      .set(otherTenantHeaders)
      .expect(404);

    const rejectedStatusResponse = await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${rejectedJobId}/status`)
      .set(headers)
      .expect(200);
    assertReaderSummaryQualityRejectedJobStatus(
      rejectedStatusResponse.body as ReaderSummaryJobStatusResponseBody,
      rejectedJobId,
      rejectedReaderSummaryId,
    );

    await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${rejectedJobId}/quality-rejection`)
      .set(headers)
      .expect(403);

    const syntheticQualityRejectionReaderAuthorization = [
      'Bearer',
      ['synthetic', 'quality', 'rejection', 'reader'].join('-'),
    ].join(' ');

    await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${rejectedJobId}/quality-rejection`)
      .set({
        ...headers,
        authorization: syntheticQualityRejectionReaderAuthorization,
        'x-workspace-role': 'admin',
      })
      .expect(403);

    const rejectionDebugResponse = await request(app.getHttpServer())
      .get(`/reader-summary-jobs/${rejectedJobId}/quality-rejection`)
      .set({
        ...headers,
        'x-workspace-role': 'admin',
      })
      .expect(200);
    assertReaderSummaryQualityRejectionDebug(
      rejectionDebugResponse.body as ReaderSummaryQualityRejectionBody,
      rejectedJobId,
      rejectedReaderSummaryId,
    );

    await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set({
        ...headers,
        'x-workspace-role': 'member',
      })
      .send({
        scope: { type: 'workspace' },
        userId,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/reader-summary-requests')
      .set({
        ...headers,
        'idempotency-key': 'readerSummary-rest-smoke-viewer-denied',
      })
      .send({
        scope: { type: 'workspace' },
        userId,
      })
      .expect(403);

    const memoryNegative = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({ memoryGuidanceApplied: 'false', limit: '5' })
      .set(headers)
      .expect(200);

    assert(
      (memoryNegative.body as ReaderSummaryListResponseBody).items.length === 0,
      'reader-summaries REST memoryGuidanceApplied=false must not return personalized artifacts',
    );

    const providerNegative = await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({ providerKey: 'hacker-news', limit: '5' })
      .set(headers)
      .expect(200);

    assert(
      (providerNegative.body as ReaderSummaryListResponseBody).items.length ===
        0,
      'reader-summaries REST providerKey filter must exclude unrelated providers',
    );

    await request(app.getHttpServer())
      .get('/reader-summaries')
      .query({ memoryGuidanceApplied: 'maybe' })
      .set(headers)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/reader-summaries/${readerSummaryId}`)
      .set({
        ...headers,
        'x-workspace-id': otherWorkspace,
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/reader-summaries/${readerSummaryId}`)
      .set(otherTenantHeaders)
      .expect(404);

    console.log('ReaderSummary REST smoke OK');
  } finally {
    await app.close();
  }
}
void main();
