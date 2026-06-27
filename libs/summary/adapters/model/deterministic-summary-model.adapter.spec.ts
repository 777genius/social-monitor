import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { defaultSummaryGenerationPolicy } from '../../domain';
import { DeterministicSummaryModelAdapter } from './deterministic-summary-model.adapter';

describe('DeterministicSummaryModelAdapter', () => {
  it('returns a no-signal draft when evidence is empty', async () => {
    const adapter = new DeterministicSummaryModelAdapter();
    const input = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      policy: defaultSummaryGenerationPolicy(),
      evidence: {
        sourceWindow: {
          windowId: 'window-1',
          startedAt: new Date('2026-06-06T00:00:00.000Z'),
          endedAt: new Date('2026-06-06T00:00:01.000Z'),
          selectedFeedItemIds: [],
        },
        items: [],
      },
    };
    const route = adapter.route(
      input,
      {
        preferredProvider: 'deterministic-local',
        maxInputTokens: 100,
        maxOutputTokens: 100,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 200,
        remainingCostUsd: 1,
      },
    );

    const attempt = await adapter.summarize(input, route);

    expect(attempt.draft.qualityFlags).toContain('no_signal');
    expect(attempt.draft.keyPoints).toEqual([]);
    expect(attempt.draft.noSignalReason).toEqual('No eligible evidence items selected for this topic.');
    expect(adapter.validateRawProviderResponse(attempt)).toEqual({ ok: true });
  });

  it('keeps memory preference context in source highlights', async () => {
    const adapter = new DeterministicSummaryModelAdapter();
    const input = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      requestedAt: new Date('2026-06-06T00:00:00.000Z'),
      policy: defaultSummaryGenerationPolicy(),
      evidence: {
        sourceWindow: {
          windowId: 'window-1',
          startedAt: new Date('2026-06-06T00:00:00.000Z'),
          endedAt: new Date('2026-06-06T00:00:01.000Z'),
          selectedFeedItemIds: ['feed-1'],
        },
        items: [
          {
            feedItemId: 'feed-1',
            sourceItemId: 'source-1',
            sourceBindingId: 'binding-1',
            providerKey: 'github',
            title: 'Agents runtime improves orchestration',
            canonicalUrl: 'https://github.com/example/agents',
            observedAt: new Date('2026-06-06T00:00:00.000Z'),
            relevance: {
              score: 2.4,
              rank: 1,
              clusterId: 'cluster-1',
              clusterSize: 1,
              duplicateFeedItemIds: [],
              whyImportant: [
                'Strong source engagement signal',
                'Fresh item in the current monitoring window',
                'Matches memory preference',
              ],
            },
          },
        ],
      },
    };
    const route = adapter.route(
      input,
      {
        preferredProvider: 'deterministic-local',
        maxInputTokens: 1000,
        maxOutputTokens: 1000,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 2000,
        remainingCostUsd: 1,
      },
    );

    const attempt = await adapter.summarize(input, route);

    expect(attempt.draft.headline).toBe('Topic summary: 1 item across 1 source (GitHub)');
    expect(attempt.draft.headline).not.toBe('Agents runtime improves orchestration');
    expect(attempt.draft.sourceHighlights[0]).toContain('Matches memory preference');
    expect(attempt.draft.sourceHighlights[0]).toContain('Strong source engagement signal');
  });
});
