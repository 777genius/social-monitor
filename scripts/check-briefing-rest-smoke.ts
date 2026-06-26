import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
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
    const tenant = tenantId('tenant-briefing-rest-smoke');
    const workspace = workspaceId('workspace-briefing-rest-smoke');
    const otherWorkspace = workspaceId('workspace-briefing-rest-other');
    const userId = 'user-briefing-rest-smoke';
    const briefingId = 'briefing-rest-smoke-1';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'viewer',
    };
    const repository = moduleRef.get<ReaderSummaryArtifactRepositoryPort>(
      READER_SUMMARY_ARTIFACT_REPOSITORY,
      { strict: false },
    );

    await repository.save(
      ReaderSummaryArtifact.create({
        schemaVersion: 'reader_summary.artifact.v1',
        readerSummaryId: briefingId,
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: 'workspace' },
        userId,
        sourceWindow: {
          windowId: 'workspace:briefing-rest-smoke',
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
            topicIds: ['topic-ai', 'topic-github'],
            providerKeys: ['reddit', 'github-repo-radar'],
            score: 2.4,
            signalBreakdown: {
              baseScore: 1,
              crossProviderSupport: 0.7,
              sameProviderSupport: 0,
              providerDiversityBoost: 0.5,
              topicDiversityBoost: 0.2,
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
        headline: 'AI tooling reader briefing',
        executiveSummary:
          'A practical AI tooling story is repeating across Reddit discussion and GitHub repository growth.',
        content: readerBriefingContent(),
        topStories: [
          {
            storyClusterId: 'story:ai-tooling',
            title: 'AI tooling signal repeats across Reddit and GitHub',
            summary:
              'Reddit discussion and repo-radar evidence point to the same agent tooling theme.',
            topicIds: ['topic-ai', 'topic-github'],
            providerKeys: ['reddit', 'github-repo-radar'],
            citationIds: ['citation-reddit', 'citation-github'],
          },
        ],
        topicHighlights: [
          {
            topicId: 'topic-ai',
            title: 'Agent tooling is the strongest AI topic',
            summary:
              'The briefing is backed by a Reddit source and a GitHub repo-radar source.',
            citationIds: ['citation-reddit', 'citation-github'],
          },
        ],
        repeatedSignals: [
          {
            storyClusterId: 'story:ai-tooling',
            title: 'Agent tooling repeated across monitored topics',
            topicIds: ['topic-ai', 'topic-github'],
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
      }),
    );

    const listResponse = await request(app.getHttpServer())
      .get('/briefings')
      .query({
        scopeType: 'workspace',
        providerKey: 'reddit',
        userId,
        memoryGuidanceApplied: 'true',
        limit: '5',
      })
      .set(headers)
      .expect(200);
    const listBody = listResponse.body as BriefingListResponseBody;

    assert(
      Array.isArray(listBody.items) && listBody.items.length === 1,
      'briefings REST list must return the seeded personalized artifact',
    );
    assertBriefingResponse(
      requireValue(listBody.items[0], 'briefings REST list item is missing'),
      briefingId,
    );

    const detailResponse = await request(app.getHttpServer())
      .get(`/briefings/${briefingId}`)
      .set(headers)
      .expect(200);

    assertBriefingResponse(
      detailResponse.body as BriefingResponseBody,
      briefingId,
    );

    const memoryNegative = await request(app.getHttpServer())
      .get('/briefings')
      .query({ memoryGuidanceApplied: 'false', limit: '5' })
      .set(headers)
      .expect(200);

    assert(
      (memoryNegative.body as BriefingListResponseBody).items.length === 0,
      'briefings REST memoryGuidanceApplied=false must not return personalized artifacts',
    );

    const providerNegative = await request(app.getHttpServer())
      .get('/briefings')
      .query({ providerKey: 'hacker-news', limit: '5' })
      .set(headers)
      .expect(200);

    assert(
      (providerNegative.body as BriefingListResponseBody).items.length === 0,
      'briefings REST providerKey filter must exclude unrelated providers',
    );

    await request(app.getHttpServer())
      .get('/briefings')
      .query({ memoryGuidanceApplied: 'maybe' })
      .set(headers)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/briefings/${briefingId}`)
      .set({
        ...headers,
        'x-workspace-id': otherWorkspace,
      })
      .expect(404);

    console.log('Briefing REST smoke OK');
  } finally {
    await app.close();
  }
}

const readerBriefingContent = (): ReaderSummaryContent => {
  const topRead = {
    title: 'OpenAI Codex is a high-signal AI tooling read',
    providerKey: 'github-repo-radar',
    providerName: 'GitHub Repo Radar',
    primaryActionKind: 'watch_repository' as const,
    reason:
      'The repository is connected to an active AI agent tooling discussion.',
    matchedTopicIds: ['topic-ai', 'topic-github'],
    matchedRules: ['agent-tooling', 'repository-growth'],
    signalScore: 2.4,
    confidence: {
      level: 'high' as const,
      score: 0.86,
      rationale: 'Cross-provider support and direct canonical links are present.',
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
    topicSections: [
      {
        topicId: 'topic-ai',
        title: 'AI tooling',
        insight:
          'The useful story is not one isolated post but a repeated provider-backed signal.',
        items: [topRead],
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
        topicIds: ['topic-ai'],
      },
      {
        providerKey: 'github-repo-radar',
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 1,
        singleSourceOnly: false,
        topicIds: ['topic-github'],
      },
    ],
    topReads: [topRead],
    trendDelta: {
      newSignals: ['agent tooling'],
      growingSignals: ['github repo radar'],
      repeatedSignals: ['cross-provider AI tooling'],
      fadingSignals: [],
    },
    openQuestions: ['Will the repository keep gaining attention after the next scan?'],
    risks: ['This is a live trend candidate, not a long-term adoption proof yet.'],
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

type BriefingListResponseBody = {
  readonly items: readonly BriefingResponseBody[];
};

type BriefingResponseBody = {
  readonly schemaVersion?: unknown;
  readonly briefingId?: unknown;
  readonly readerBrief?: {
    readonly topReads?: readonly {
      readonly title?: unknown;
      readonly canonicalUrl?: unknown;
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

const assertBriefingResponse = (
  body: BriefingResponseBody,
  briefingId: string,
): void => {
  assert(
    body.schemaVersion === 'briefing.artifact.v1',
    'briefings REST must map reader summaries to the briefing artifact schema',
  );
  assert(body.briefingId === briefingId, 'briefings REST must expose briefingId');
  assert(
    body.personalization?.memoryGuidanceStatus === 'available' &&
      body.personalization.memoryGuidanceApplied === true,
    'briefings REST must preserve memory personalization evidence',
  );
  const personalization = requireValue(
    body.personalization,
    'briefings REST personalization is missing',
  );
  assert(
    personalization.signals?.includes('keyword:agent tooling') === true,
    'briefings REST must expose safe personalization signals',
  );
  assert(
    body.coverage?.hasCrossProviderEvidence === true,
    'briefings REST must expose cross-provider coverage',
  );
  const coverage = requireValue(
    body.coverage,
    'briefings REST coverage is missing',
  );
  assert(
    coverage.topProviderKeys?.includes('reddit') === true &&
      coverage.topProviderKeys.includes('github-repo-radar') === true,
    'briefings REST coverage must include the provider mix',
  );

  const topRead = requireValue(
    body.readerBrief?.topReads?.[0],
    'briefings REST must expose top reads',
  );
  assert(
    topRead.canonicalUrl === 'https://github.com/openai/codex',
    'briefings REST top reads must include canonical URLs',
  );
  assert(
    typeof topRead.whyNow === 'string' &&
      topRead.whyNow.includes('fresh Reddit discussion'),
    'briefings REST top reads must explain why the item matters now',
  );
  assert(
    topRead.confirmedProviderKeys?.includes('reddit') === true &&
      topRead.confirmedProviderKeys.includes('github-repo-radar') === true,
    'briefings REST top reads must preserve confirmed provider support',
  );

  const sourceProviders =
    body.readerBrief?.sourceMix?.map((source) => source.providerKey) ?? [];
  assert(
    sourceProviders.includes('reddit') &&
      sourceProviders.includes('github-repo-radar'),
    'briefings REST reader brief must expose source mix',
  );

  const citations = requireValue(
    body.citations,
    'briefings REST citations are missing',
  );
  const citationUrls = citations.map((citation) => citation.canonicalUrl);
  assert(
    citations.length === 2 &&
      citationUrls.includes('https://github.com/openai/codex') === true &&
      citationUrls.includes(
        'https://www.reddit.com/r/LocalLLaMA/comments/example',
      ),
    'briefings REST must expose canonical citation links',
  );
  assert(
    citations[0]?.label === '[1]' && citations[1]?.label === '[2]',
    'briefings REST must expose stable citation labels',
  );
};

void main();
