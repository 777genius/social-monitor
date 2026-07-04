import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  emptyReaderSummaryReliabilityReport,
  ReaderSummaryArtifact,
  type ReaderSummaryContent,
} from '@social-monitor/summary/domain';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { READER_SUMMARY_ARTIFACT_REPOSITORY } from '@social-monitor/summary/interfaces/rest/summary-provider-tokens';
import type { ReaderSummaryArtifactRepositoryPort } from '@social-monitor/summary/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const requireValue = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
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
        selectedFeedItemIds: ['feed-reddit', 'feed-github'],
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
      headline: 'AI tooling reader readerSummary',
      executiveSummary:
        'A practical AI tooling story is repeating across Reddit discussion and GitHub repository growth.',
      content: readerReaderSummaryContent(),
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
            'The readerSummary is backed by a Reddit source and a GitHub repo-radar source.',
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
    await repository.save(dailyArtifact);

    const baseArtifact = dailyArtifact.toSnapshot();
    await repository.save(
      ReaderSummaryArtifact.create({
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
        },
        storyClusters: baseArtifact.storyClusters.map((cluster) => ({
          ...cluster,
          observedAtRange: {
            startedAt: new Date('2026-06-16T08:00:00.000Z'),
            endedAt: new Date('2026-06-21T08:30:00.000Z'),
          },
        })),
        headline: 'Weekly AI tooling reader summary',
      }),
    );

    await repository.save(
      ReaderSummaryArtifact.create({
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
        },
        headline: 'Monthly AI tooling reader summary',
      }),
    );

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

const readerReaderSummaryContent = (): ReaderSummaryContent => {
  const topRead = {
    title: 'OpenAI Codex is a high-signal AI tooling read',
    providerKey: 'github-repo-radar',
    providerName: 'GitHub Repo Radar',
    primaryActionKind: 'watch_repository' as const,
    reason:
      'The repository is connected to an active AI agent tooling discussion.',
    matchedInterestIds: ['topic-ai', 'topic-github'],
    matchedRules: ['agent-tooling', 'repository-growth'],
    signalScore: 2.4,
    confidence: {
      level: 'high' as const,
      score: 0.86,
      rationale:
        'Cross-provider support and direct canonical links are present.',
    },
    confirmedProviderKeys: ['reddit', 'github-repo-radar'],
    providerMetrics: [
      { label: 'GitHub stars', value: '54k' },
      { label: 'Reddit score', value: 'top discussion' },
    ],
    whyImportant: [
      'It matches the user preference for practical AI developer tooling.',
      'The same story appears in more than one provider.',
    ],
    whyNow:
      'The latest scan saw fresh Reddit discussion plus GitHub repo-radar evidence in the same window.',
    canonicalUrl: 'https://github.com/openai/codex',
    citationIds: ['citation-reddit', 'citation-github'],
  };

  return {
    headline: 'AI tooling sources agree on one practical signal',
    oneLineTakeaway:
      'Agent tooling is the clearest story because Reddit and GitHub point at the same theme.',
    bullets: [
      'Top read includes canonical source links for the UI.',
      'Source mix stays explicit so the reader can see where the signal came from.',
      'Memory guidance is applied without hiding the underlying citations.',
    ],
    qualityState: {
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    },
    interestSections: [
      {
        interestId: 'topic-ai',
        title: 'AI tooling',
        insight:
          'The useful story is not one isolated post but a repeated provider-backed signal.',
        items: [],
        citationIds: ['citation-reddit', 'citation-github'],
      },
    ],
    sourceMix: [
      {
        providerKey: 'reddit',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ['topic-ai'],
      },
      {
        providerKey: 'github-repo-radar',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        interestIds: ['topic-github'],
      },
    ],
    topReads: [topRead],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: ['agent tooling'],
      growingSignals: ['github repo radar'],
      repeatedSignals: ['cross-provider AI tooling'],
      fadingSignals: [],
    },
    openQuestions: [
      'Will the repository keep gaining attention after the next scan?',
    ],
    risks: [
      'This is a live trend candidate, not a long-term adoption proof yet.',
    ],
    nextActions: [
      {
        kind: 'watch_repository',
        label: 'Watch repository',
        reason: 'Repo growth and Reddit attention are both present.',
        citationIds: ['citation-github'],
        canonicalUrl: 'https://github.com/openai/codex',
      },
    ],
  };
};

type ReaderSummaryListResponseBody = {
  readonly items: readonly ReaderSummaryResponseBody[];
};

type ReaderSummaryResponseBody = {
  readonly schemaVersion?: unknown;
  readonly readerSummaryId?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
  readonly readerBrief?: {
    readonly topReads?: readonly {
      readonly title?: unknown;
      readonly canonicalUrl?: unknown;
      readonly providerName?: unknown;
      readonly primaryActionKind?: unknown;
      readonly whyNow?: unknown;
      readonly citationIds?: readonly unknown[];
      readonly confirmedProviderKeys?: readonly unknown[];
    }[];
    readonly sourceMix?: readonly {
      readonly providerKey?: unknown;
    }[];
  };
  readonly citations?: readonly {
    readonly citationId?: unknown;
    readonly label?: unknown;
    readonly providerKey?: unknown;
    readonly canonicalUrl?: unknown;
  }[];
  readonly personalization?: {
    readonly memoryGuidanceStatus?: unknown;
    readonly memoryGuidanceApplied?: unknown;
    readonly signals?: readonly unknown[];
  };
  readonly coverage?: {
    readonly hasCrossProviderEvidence?: unknown;
    readonly topProviderKeys?: readonly unknown[];
  };
};

type RequestReaderSummaryResponseBody = {
  readonly readerSummaryJobId?: unknown;
  readonly status?: unknown;
  readonly created?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
};

type ReaderSummaryJobStatusResponseBody = {
  readonly readerSummaryJobId?: unknown;
  readonly period?: ReaderSummaryPeriodBody;
  readonly scope?: {
    readonly type?: unknown;
  };
  readonly status?: unknown;
  readonly requestedAt?: unknown;
  readonly timeline?: readonly {
    readonly status?: unknown;
    readonly message?: unknown;
  }[];
};

type ReaderSummaryPeriodBody = {
  readonly cadence?: unknown;
  readonly startedAt?: unknown;
  readonly endedAt?: unknown;
  readonly timezone?: unknown;
  readonly periodKey?: unknown;
};

const requireString = (value: unknown, message: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
};

const assertReaderSummaryResponse = (
  body: ReaderSummaryResponseBody,
  readerSummaryId: string,
  cadence: 'daily' | 'weekly' | 'monthly',
): void => {
  assert(
    body.schemaVersion === 'reader_summary.artifact.v1',
    'reader-summaries REST must map reader summaries to the readerSummary artifact schema',
  );
  assert(
    body.readerSummaryId === readerSummaryId,
    'reader-summaries REST must expose readerSummaryId',
  );
  assertReaderSummaryPeriod(
    body.period,
    cadence,
    'reader-summaries REST must expose the artifact period',
  );
  assert(
    body.personalization?.memoryGuidanceStatus === 'available' &&
      body.personalization.memoryGuidanceApplied === true,
    'reader-summaries REST must preserve memory personalization evidence',
  );
  const personalization = requireValue(
    body.personalization,
    'reader-summaries REST personalization is missing',
  );
  assert(
    personalization.signals?.includes('keyword:agent tooling') === true,
    'reader-summaries REST must expose safe personalization signals',
  );
  assert(
    body.coverage?.hasCrossProviderEvidence === true,
    'reader-summaries REST must expose cross-provider coverage',
  );
  const coverage = requireValue(
    body.coverage,
    'reader-summaries REST coverage is missing',
  );
  assert(
    coverage.topProviderKeys?.includes('reddit') === true &&
      coverage.topProviderKeys.includes('github-repo-radar') === true,
    'reader-summaries REST coverage must include the provider mix',
  );

  const topRead = requireValue(
    body.readerBrief?.topReads?.[0],
    'reader-summaries REST must expose top reads',
  );
  assert(
    topRead.canonicalUrl === 'https://github.com/openai/codex',
    'reader-summaries REST top reads must include canonical URLs',
  );
  assert(
    topRead.providerName === 'GitHub Repo Radar',
    'reader-summaries REST top reads must expose provider display names',
  );
  assert(
    topRead.primaryActionKind === 'watch_repository',
    'reader-summaries REST top reads must expose the primary reader action',
  );
  assert(
    typeof topRead.whyNow === 'string' &&
      topRead.whyNow.includes('fresh Reddit discussion'),
    'reader-summaries REST top reads must explain why the item matters now',
  );
  assert(
    topRead.confirmedProviderKeys?.includes('reddit') === true &&
      topRead.confirmedProviderKeys.includes('github-repo-radar') === true,
    'reader-summaries REST top reads must preserve confirmed provider support',
  );

  const sourceProviders =
    body.readerBrief?.sourceMix?.map((source) => source.providerKey) ?? [];
  assert(
    sourceProviders.includes('reddit') &&
      sourceProviders.includes('github-repo-radar'),
    'reader-summaries REST reader brief must expose source mix',
  );

  const citations = requireValue(
    body.citations,
    'reader-summaries REST citations are missing',
  );
  const citationUrls = citations.map((citation) => citation.canonicalUrl);
  assert(
    citations.length === 2 &&
      citationUrls.includes('https://github.com/openai/codex') === true &&
      citationUrls.includes(
        'https://www.reddit.com/r/LocalLLaMA/comments/example',
      ),
    'reader-summaries REST must expose canonical citation links',
  );
  assert(
    citations[0]?.label === '[1]' && citations[1]?.label === '[2]',
    'reader-summaries REST must expose stable citation labels',
  );
};

const assertReaderSummaryJobStatus = (
  body: ReaderSummaryJobStatusResponseBody,
  readerSummaryJobId: string,
  cadence: 'daily' | 'weekly' | 'monthly',
): void => {
  assert(
    body.readerSummaryJobId === readerSummaryJobId,
    'readerSummary job status REST must expose the requested job id',
  );
  assert(
    body.scope?.type === 'workspace',
    'readerSummary job status REST must expose the requested scope',
  );
  assertReaderSummaryPeriod(
    body.period,
    cadence,
    'readerSummary job status REST must expose the requested period',
  );
  assert(
    body.status === 'requested',
    'readerSummary job status REST must expose requested status before worker drain',
  );
  assert(
    typeof body.requestedAt === 'string' && body.requestedAt.length > 0,
    'readerSummary job status REST must expose requestedAt',
  );
  assert(
    body.timeline?.some(
      (event) =>
        event.status === 'requested' &&
        event.message === 'Reader summary requested',
    ) === true,
    'reader summary job status REST must expose canonical timeline language',
  );
};

const assertReaderSummaryPeriod = (
  period: ReaderSummaryPeriodBody | undefined,
  cadence: 'daily' | 'weekly' | 'monthly',
  message: string,
): void => {
  const value = requireValue(period, message);
  assert(value.cadence === cadence, `${message}: cadence must be ${cadence}`);
  const startedAt = requireString(
    value.startedAt,
    `${message}: startedAt is required`,
  );
  const endedAt = requireString(
    value.endedAt,
    `${message}: endedAt is required`,
  );
  const timezone = requireString(
    value.timezone,
    `${message}: timezone is required`,
  );
  const periodKey = requireString(
    value.periodKey,
    `${message}: periodKey is required`,
  );
  assert(
    Date.parse(startedAt) < Date.parse(endedAt),
    `${message}: startedAt must be before endedAt`,
  );
  assert(
    periodKey.includes(`${cadence}:`) && periodKey.includes(timezone),
    `${message}: periodKey must include cadence and timezone`,
  );
};

void main();
