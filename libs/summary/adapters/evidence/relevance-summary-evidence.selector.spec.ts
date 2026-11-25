import { ok, FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { RankFeedItemsUseCase } from '@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case';

import { RelevanceSummaryEvidenceSelector } from './relevance-summary-evidence.selector';

describe('RelevanceSummaryEvidenceSelector', () => {
  it('selects ranked evidence from the rolling 24 hour summary window', async () => {
    const execute = jest.fn(async () =>
      ok({
        generatedAt: '2026-06-27T12:00:00.000Z',
        profileApplied: false,
        memoryGuidance: {
          status: 'disabled',
          applied: false,
          providerPreferenceCount: 0,
          keywordPreferenceCount: 0,
          mutedKeywordCount: 0,
          blockedProviderCount: 0,
          signals: [],
        },
        items: [],
      }),
    );
    const selector = new RelevanceSummaryEvidenceSelector(
      { execute } as unknown as RankFeedItemsUseCase,
      new FixedClock(new Date('2026-06-27T12:00:00.000Z')),
    );

    const result = await selector.select({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      maxItems: 10,
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      limit: 10,
      observedAtOrAfter: new Date('2026-06-26T12:00:00.000Z'),
      observedAtOrBefore: new Date('2026-06-27T12:00:00.000Z'),
    }));
    expect(result.sourceWindow).toEqual({
      windowId: 'tenant-1:workspace-1:interest-1:personalized-empty',
      startedAt: new Date('2026-06-26T12:00:00.000Z'),
      endedAt: new Date('2026-06-27T12:00:00.000Z'),
      selectedFeedItemIds: [],
    });
  });
});
