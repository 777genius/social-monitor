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
});
