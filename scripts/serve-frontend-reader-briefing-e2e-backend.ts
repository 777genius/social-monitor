import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryRelevanceFeedbackRepository } from '@social-monitor/relevance/adapters/persistence/in-memory-relevance-feedback.repository';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { BriefingArtifact } from '@social-monitor/summary/domain';
import { InMemoryBriefingArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-briefing-artifact.repository';

import { AppModule } from '../apps/api-gateway/src/app.module';

const tenant = tenantId('tenant-frontend-reader-briefing-e2e');
const workspace = workspaceId('workspace-frontend-reader-briefing-e2e');
const userId = 'user-frontend-reader-briefing-e2e';
const briefingId = 'briefing-frontend-reader-briefing-e2e';
const startedAt = new Date('2026-06-24T08:00:00.000Z');
const endedAt = new Date('2026-06-24T08:30:00.000Z');

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'idempotency-key',
      'x-correlation-id',
      'x-tenant-id',
      'x-workspace-id',
      'x-workspace-role',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  registerE2eDiagnostics(app);
  await app.init();
  await seedReaderBriefing(app);
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  console.log(JSON.stringify({
    status: 'ready',
    apiBaseUrl: `http://127.0.0.1:${port}`,
    tenantId: tenant,
    workspaceId: workspace,
    userId,
    briefingId,
    diagnosticsUrl: `http://127.0.0.1:${port}/__e2e/reader-feedback`,
  }));

  const shutdown = async (): Promise<void> => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

function registerE2eDiagnostics(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as {
    get: (path: string, handler: (_request: unknown, response: {
      json: (body: unknown) => void;
    }) => void) => void;
  };
  express.get('/__e2e/reader-feedback', (_request, response) => {
    const feedback = app.get(InMemoryRelevanceFeedbackRepository).all();
    response.json({
      count: feedback.length,
      items: feedback.map((entry) => entry.toSnapshot()),
    });
  });
}

async function seedReaderBriefing(app: INestApplication): Promise<void> {
  const briefings = app.get(InMemoryBriefingArtifactRepository);
  await briefings.save(BriefingArtifact.create({
    schemaVersion: 'briefing.artifact.v1',
    briefingId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: 'workspace' },
    userId,
    sourceWindow: {
      windowId: 'workspace:frontend-reader-briefing-e2e',
      startedAt,
      endedAt,
      selectedFeedItemIds: ['feed-github-codex', 'feed-reddit-codex'],
      storyClusterIds: ['story:codex-growth'],
    },
    storyClusters: [
      {
        id: 'story:codex-growth',
        storyKey: 'repo:github.com/openai/codex',
        representativeFeedItemId: 'feed-github-codex',
        duplicateFeedItemIds: ['feed-reddit-codex'],
        topicIds: ['topic-ai-devtools'],
        providerKeys: ['github-repo-radar', 'reddit'],
        score: 0.84,
        observedAtRange: { startedAt, endedAt },
        whyImportant: ['GitHub trend is confirmed by social discussion.'],
      },
    ],
    contextArtifacts: [],
    headline: 'AI developer tooling reader briefing',
    executiveSummary: 'openai/codex is the strongest cross-source AI tooling signal in this workspace window.',
    readerBrief: {
      headline: 'AI developer tooling reader briefing',
      oneLineTakeaway: 'Codex growth is backed by GitHub traction and Reddit discussion.',
      bullets: [
        'Best first read: openai/codex growth - GitHub trend is confirmed by social discussion.',
        'Reddit discussion confirms operator interest around agent tooling.',
      ],
      qualityState: {
        status: 'partial',
        flags: ['partial_evidence', 'limited_sources'],
        warnings: ['Only two source families contributed to this briefing.'],
        isSingleSource: false,
      },
      topicSections: [
        {
          topicId: 'topic-ai-devtools',
          title: 'AI devtools',
          insight: 'Agentic coding tools are the clearest signal in the current monitoring window.',
          citationIds: ['bc-1', 'bc-2'],
          items: [
            {
              title: 'openai/codex growth',
              providerKey: 'github-repo-radar',
              reason: 'Repo growth is reinforced by Reddit discussion.',
              matchedTopicIds: ['topic-ai-devtools'],
              matchedRules: ['repo_growth', 'cross_source_confirmation'],
              signalScore: 0.84,
              providerMetrics: [
                { label: 'Stars', value: '54000' },
                { label: 'Trend', value: '+360 / 48h' },
              ],
              whyImportant: ['Cross-source confirmation reduces single-source risk.'],
              whyNow: 'The signal appeared in the current briefing window.',
              canonicalUrl: 'https://github.com/openai/codex',
              citationIds: ['bc-1', 'bc-2'],
            },
          ],
        },
      ],
      sourceMix: [
        {
          providerKey: 'github-repo-radar',
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          topicIds: ['topic-ai-devtools'],
        },
        {
          providerKey: 'reddit',
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          topicIds: ['topic-ai-devtools'],
        },
      ],
      topReads: [
        {
          title: 'openai/codex growth',
          providerKey: 'github-repo-radar',
          reason: 'Repo growth is reinforced by Reddit discussion.',
          matchedTopicIds: ['topic-ai-devtools'],
          matchedRules: ['repo_growth', 'cross_source_confirmation'],
          signalScore: 0.84,
          providerMetrics: [
            { label: 'Stars', value: '54000' },
            { label: 'Trend', value: '+360 / 48h' },
          ],
          whyImportant: ['Cross-source confirmation reduces single-source risk.'],
          whyNow: 'The signal appeared in the current briefing window.',
          canonicalUrl: 'https://github.com/openai/codex',
          citationIds: ['bc-1', 'bc-2'],
        },
      ],
      trendDelta: {
        newSignals: ['openai/codex'],
        growingSignals: ['AI devtools'],
        repeatedSignals: [],
        fadingSignals: [],
      },
      openQuestions: ['Will discussion persist after the initial repo growth spike?'],
      risks: ['GitHub stars measure attention, not production adoption.'],
      nextActions: [
        {
          kind: 'read_source',
          label: 'Read source',
          reason: 'Open the canonical GitHub source.',
          citationIds: ['bc-1'],
          canonicalUrl: 'https://github.com/openai/codex',
        },
        {
          kind: 'mark_relevant',
          label: 'Mark relevant',
          reason: 'Tune future reader briefings toward this signal.',
          citationIds: ['bc-1', 'bc-2'],
          canonicalUrl: 'https://github.com/openai/codex',
        },
        {
          kind: 'watch_repository',
          label: 'Watch repository',
          reason: 'Requires a repository-watch backend workflow.',
          citationIds: ['bc-1'],
          canonicalUrl: 'https://github.com/openai/codex',
        },
      ],
    },
    topStories: [
      {
        storyClusterId: 'story:codex-growth',
        title: 'openai/codex growth',
        summary: 'GitHub growth and Reddit discussion point to active interest in AI coding agents.',
        topicIds: ['topic-ai-devtools'],
        providerKeys: ['github-repo-radar', 'reddit'],
        citationIds: ['bc-1', 'bc-2'],
      },
    ],
    topicHighlights: [
      {
        topicId: 'topic-ai-devtools',
        title: 'AI devtools',
        summary: 'Agentic coding tools are driving the strongest monitored signal.',
        citationIds: ['bc-1', 'bc-2'],
      },
    ],
    repeatedSignals: [],
    risksAndUnknowns: [
      {
        description: 'GitHub stars measure attention, not production adoption.',
        citationIds: ['bc-1'],
        reason: 'source_limit',
      },
    ],
    citationMap: [
      {
        citationId: 'bc-1',
        feedItemId: 'feed-github-codex',
        sourceItemId: 'github:openai/codex',
        providerKey: 'github-repo-radar',
        field: 'canonicalUrl',
        canonicalUrl: 'https://github.com/openai/codex',
      },
      {
        citationId: 'bc-2',
        feedItemId: 'feed-reddit-codex',
        sourceItemId: 'reddit:codex-discussion',
        providerKey: 'reddit',
        field: 'bodyPreview',
        canonicalUrl: 'https://reddit.example/r/LocalLLaMA/comments/codex',
      },
    ],
    qualityFlags: ['partial_evidence', 'limited_sources'],
    confidence: {
      level: 'medium',
      score: 0.72,
      rationale: 'Two source families agree on the same story cluster.',
    },
    lineage: {
      promptVersion: 'briefing.reader.e2e.v1',
      schemaVersion: 'briefing.artifact.v1',
      modelVersion: 'deterministic-e2e',
      providerVersion: 'fixture',
      rulesVersion: 'briefing.rules.e2e.v1',
      evalDatasetVersion: 'reader-briefing-e2e.v1',
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    },
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
