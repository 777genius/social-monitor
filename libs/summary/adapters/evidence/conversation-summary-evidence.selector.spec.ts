import {
  contentHashForConversationUnit,
  ConversationUnit,
  type ConversationUnitProps,
} from '@social-monitor/conversation/domain';
import { InMemoryConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository';
import {
  FixedClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
} from '../../ports';
import { ConversationSummaryEvidenceSelector } from './conversation-summary-evidence.selector';

class StaticEvidenceSelector implements SummaryEvidenceSelectorPort {
  async select(): Promise<SummaryEvidenceSelection> {
    return {
      sourceWindow: {
        windowId: 'window-1',
        startedAt: new Date('2026-06-05T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:00:00.000Z'),
        selectedFeedItemIds: ['feed-post-1'],
      },
      items: [
        {
          feedItemId: 'feed-post-1',
          sourceItemId: 'source-post-1',
          sourceBindingId: 'source-binding-1',
          providerKey: 'reddit',
          title: 'Root post',
          bodyPreview: 'Root post body.',
          canonicalUrl: 'https://reddit.test/r/topic/comments/post_1',
          observedAt: new Date('2026-06-05T12:00:00.000Z'),
        },
      ],
    };
  }
}

describe('ConversationSummaryEvidenceSelector', () => {
  it('attaches ranked conversation context to selected root evidence', async () => {
    const repository = new InMemoryConversationUnitRepository();
    await repository.saveBatch({
      tenantId: tenantId('tenant-summary-conversation-test'),
      workspaceId: workspaceId('workspace-summary-conversation-test'),
      units: [
        conversationUnit({
          id: 'conversation-low',
          providerUnitId: 't1_low',
          body: 'Low-score comment.',
          score: 1,
        }),
        conversationUnit({
          id: 'conversation-high',
          providerUnitId: 't1_high',
          body: 'High-score comment with useful discussion context.',
          score: 120,
          replies: 4,
        }),
      ],
    });
    const selector = new ConversationSummaryEvidenceSelector(
      new StaticEvidenceSelector(),
      repository,
      repository,
      new FixedClock(new Date('2026-06-05T12:30:00.000Z')),
      {
        promptLimitPerRoot: 1,
      },
    );

    const result = await selector.select({
      tenantId: tenantId('tenant-summary-conversation-test'),
      workspaceId: workspaceId('workspace-summary-conversation-test'),
      interestId: 'interest-1',
      maxItems: 5,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.conversationContext).toMatchObject({
      rankingBasis: 'cohort_baseline_v1',
      units: [
        {
          conversationUnitId: 'conversation-high',
          providerUnitId: 't1_high',
          body: 'High-score comment with useful discussion context.',
          providerScore: 120,
          replyCount: 4,
          depth: 0,
          role: 'top_level_comment',
        },
      ],
    });
  });
});

const conversationUnit = (
  overrides: {
    readonly id: string;
    readonly providerUnitId: string;
    readonly body: string;
    readonly score: number;
    readonly replies?: number;
  },
): ConversationUnit => {
  const props: ConversationUnitProps = {
    id: overrides.id,
    tenantId: tenantId('tenant-summary-conversation-test'),
    workspaceId: workspaceId('workspace-summary-conversation-test'),
    interestId: 'interest-1',
    sourceBindingId: 'source-binding-1',
    rootFeedItemId: 'feed-post-1',
    rootProviderItemId: 't3_post_1',
    providerKey: 'reddit',
    providerUnitId: overrides.providerUnitId,
    canonicalUrl: `https://reddit.test/r/topic/comments/post_1/_/${overrides.providerUnitId}`,
    body: overrides.body,
    publishedAt: new Date('2026-06-05T12:05:00.000Z'),
    observedAt: new Date('2026-06-05T12:10:00.000Z'),
    threadExternalId: 't3_post_1',
    depth: 0,
    role: 'top_level_comment',
    providerMetadata: {
      kind: 'reddit_comment',
      subreddit: 'topic',
      score: overrides.score,
      replies: overrides.replies ?? 0,
      depth: 0,
      role: 'top_level_comment',
    },
    contentHash: '',
    schemaVersion: 1,
  };

  return ConversationUnit.capture({
    ...props,
    contentHash: contentHashForConversationUnit(props),
  });
};
