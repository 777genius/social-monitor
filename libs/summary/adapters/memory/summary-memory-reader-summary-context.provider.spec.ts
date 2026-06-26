import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  SummaryMemoryContext,
  SummaryMemoryPort,
  SummaryMemoryWriteResult,
} from '../../ports';
import { topicReaderSummaryScope } from '../../domain';
import { SummaryMemoryReaderSummaryContextProvider } from './summary-memory-reader-summary-context.provider';

describe('SummaryMemoryReaderSummaryContextProvider', () => {
  it('maps available summary memory into a reader context artifact', async () => {
    const memory = new CapturingSummaryMemory({
      status: 'available',
      renderedText: 'User prefers concise risk-first summaries. Bearer token-value',
      retrieval: {
        retrievalSourcesUsed: ['vector', 'graph'],
        factsUsed: 2,
        itemsUsed: 3,
      },
      diagnostics: { provider: 'memo-stack' },
      retrievedAt: new Date('2026-06-26T08:00:00.000Z'),
    });

    const artifacts = await new SummaryMemoryReaderSummaryContextProvider(memory).buildContext({
      tenantId: tenantId('tenant-memory-reader'),
      workspaceId: workspaceId('workspace-memory-reader'),
      scope: topicReaderSummaryScope('topic-ai'),
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      evidence: makeReaderEvidenceSelection(),
      requestedAt: new Date('2026-06-26T08:01:00.000Z'),
    });

    expect(memory.queries).toEqual([
      expect.objectContaining({
        topicId: 'topic-ai',
        userId: 'user-1',
        subscriptionId: 'subscription-1',
        evidence: expect.objectContaining({
          items: [
            expect.objectContaining({
              feedItemId: 'feed-1',
              providerKey: 'reddit',
              title: 'Runtime regression discussion',
            }),
          ],
        }),
      }),
    ]);
    expect(artifacts).toEqual([
      {
        artifactId: 'summary-memory:topic:topic-ai',
        scope: topicReaderSummaryScope('topic-ai'),
        summaryText: expect.stringContaining('[REDACTED]'),
        generatedAt: new Date('2026-06-26T08:00:00.000Z'),
        freshness: 'fresh',
      },
    ]);
    expect(artifacts[0]?.summaryText).toEqual(expect.stringContaining('facts_used=2'));
  });

  it('omits disabled or empty memory without marking the reader summary unavailable', async () => {
    const memory = new CapturingSummaryMemory({
      status: 'disabled',
      diagnostics: { mode: 'disabled' },
      retrievedAt: new Date('2026-06-26T08:00:00.000Z'),
    });

    await expect(new SummaryMemoryReaderSummaryContextProvider(memory).buildContext({
      tenantId: tenantId('tenant-memory-reader'),
      workspaceId: workspaceId('workspace-memory-reader'),
      scope: topicReaderSummaryScope('topic-ai'),
      evidence: makeReaderEvidenceSelection(),
      requestedAt: new Date('2026-06-26T08:01:00.000Z'),
    })).resolves.toEqual([]);
  });

  it('marks context stale when stale memory facts were used', async () => {
    const memory = new CapturingSummaryMemory({
      status: 'available',
      renderedText: 'Older provider quality lesson.',
      staleMarkers: { staleFactsUsed: 1 },
      diagnostics: {},
      retrievedAt: new Date('2026-06-26T08:00:00.000Z'),
    });

    const artifacts = await new SummaryMemoryReaderSummaryContextProvider(memory).buildContext({
      tenantId: tenantId('tenant-memory-reader'),
      workspaceId: workspaceId('workspace-memory-reader'),
      scope: topicReaderSummaryScope('topic-ai'),
      evidence: makeReaderEvidenceSelection(),
      requestedAt: new Date('2026-06-26T08:01:00.000Z'),
    });

    expect(artifacts[0]?.freshness).toBe('stale');
  });

  it('preserves fallback memory retrieval diagnostics in reader context text', async () => {
    const memory = new CapturingSummaryMemory({
      status: 'available',
      renderedText: 'Fallback provider quality memory.\nFallback topic feedback memory.',
      retrieval: {
        retrievalSourcesUsed: ['vector', 'graph'],
        factsUsed: 2,
        itemsUsed: 2,
      },
      staleMarkers: { staleFactsUsed: 1 },
      diagnostics: { fallbackFromScopeNotFound: true, fallbackScopesUsed: 2 },
      retrievedAt: new Date('2026-06-26T08:00:00.000Z'),
    });

    const artifacts = await new SummaryMemoryReaderSummaryContextProvider(memory).buildContext({
      tenantId: tenantId('tenant-memory-reader'),
      workspaceId: workspaceId('workspace-memory-reader'),
      scope: topicReaderSummaryScope('topic-ai'),
      evidence: makeReaderEvidenceSelection(),
      requestedAt: new Date('2026-06-26T08:01:00.000Z'),
    });

    expect(artifacts[0]).toEqual(expect.objectContaining({
      summaryText: expect.stringContaining('Memory retrieval diagnostics: sources=vector, graph; facts_used=2; items_used=2'),
      freshness: 'stale',
    }));
  });
});

class CapturingSummaryMemory implements SummaryMemoryPort {
  readonly queries: Parameters<SummaryMemoryPort['buildContext']>[0][] = [];

  constructor(private readonly context: SummaryMemoryContext) {}

  async buildContext(query: Parameters<SummaryMemoryPort['buildContext']>[0]): Promise<SummaryMemoryContext> {
    this.queries.push(query);

    return this.context;
  }

  async recordSummaryFeedback(): Promise<SummaryMemoryWriteResult> {
    return { status: 'disabled' };
  }
}

const makeReaderEvidenceSelection = () => ({
  rankingPolicyVersion: 'story-ranking.v1',
  sourceWindow: {
    windowId: 'window-1',
    startedAt: new Date('2026-06-26T07:00:00.000Z'),
    endedAt: new Date('2026-06-26T08:00:00.000Z'),
    selectedFeedItemIds: ['feed-1'],
    storyClusterIds: ['cluster-1'],
  },
  clusters: [
    {
      id: 'cluster-1',
      storyKey: 'runtime-regression',
      representativeFeedItemId: 'feed-1',
      duplicateFeedItemIds: [],
      topicIds: ['topic-ai'],
      providerKeys: ['reddit'],
      score: 1,
      observedAtRange: {
        startedAt: new Date('2026-06-26T07:30:00.000Z'),
        endedAt: new Date('2026-06-26T07:30:00.000Z'),
      },
      whyImportant: ['Matches user preference'],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: 'feed-1',
      sourceItemId: 'reddit-post-1',
      sourceBindingId: 'binding-1',
      topicId: 'topic-ai',
      providerKey: 'reddit',
      providerName: 'Reddit',
      canonicalUrl: 'https://reddit.example.test/post-1',
      title: 'Runtime regression discussion',
      bodyPreview: 'Users are discussing a runtime regression.',
      publishedAt: new Date('2026-06-26T07:20:00.000Z'),
      observedAt: new Date('2026-06-26T07:30:00.000Z'),
      score: 1,
      whyImportant: ['Matches user preference'],
    },
  ],
});
