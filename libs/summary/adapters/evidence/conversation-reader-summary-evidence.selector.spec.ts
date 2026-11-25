import { InMemoryConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository';
import {
  contentHashForConversationUnit,
  ConversationUnit,
  type ConversationUnitProps,
} from '@social-monitor/conversation/domain';
import {
  FixedClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  ReaderSummaryPeriod,
  SummaryEvidenceSelection,
} from '../../domain';
import type { ReaderSummaryEvidenceSelectorPort } from '../../ports';
import { ConversationEvidenceContextReader } from './conversation-evidence-context.reader';
import { ConversationReaderSummaryEvidenceSelector } from './conversation-reader-summary-evidence.selector';

const tenant = tenantId('tenant-reader-conversation-test');
const workspace = workspaceId('workspace-reader-conversation-test');
const period: ReaderSummaryPeriod = {
  cadence: 'daily',
  startedAt: new Date('2026-06-05T00:00:00.000Z'),
  endedAt: new Date('2026-06-06T00:00:00.000Z'),
  timezone: 'UTC',
  periodKey: 'daily:2026-06-05T00:00:00.000Z:2026-06-06T00:00:00.000Z:UTC',
};

describe('ConversationReaderSummaryEvidenceSelector', () => {
  it('attaches ranked conversation context to reader summary evidence', async () => {
    const repository = new InMemoryConversationUnitRepository();
    await repository.saveBatch({
      tenantId: tenant,
      workspaceId: workspace,
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
          body: 'High-score reader summary comment.',
          score: 180,
          replies: 9,
        }),
        conversationUnit({
          id: 'conversation-after-cutoff',
          providerUnitId: 't1_after_cutoff',
          body: 'Late high-score comment.',
          score: 999,
          observedAt: new Date('2026-06-05T12:10:00.001Z'),
        }),
      ],
    });
    const selector = new ConversationReaderSummaryEvidenceSelector(
      new StaticReaderEvidenceSelector(),
      new ConversationEvidenceContextReader(
        repository,
        repository,
        new FixedClock(new Date('2026-06-05T12:30:00.000Z')),
        {
          promptLimitPerRoot: 1,
        },
      ),
    );

    const result = await selector.select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: 'workspace' },
      period,
      maxItems: 5,
      observedThrough: new Date('2026-06-05T12:10:00.000Z'),
    });

    expect(result.selectedEvidence[0]?.conversationContext).toMatchObject({
      rankingBasis: 'cohort_baseline_v1',
      units: [
        {
          conversationUnitId: 'conversation-high',
          providerUnitId: 't1_high',
          body: 'High-score reader summary comment.',
          providerScore: 180,
          replyCount: 9,
          selectionReason: 'ranked',
        },
      ],
    });
    expect(result.sourceWindow.selectedFeedItemIds).toEqual(['feed-post-1']);
  });
});

class StaticReaderEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(): Promise<SummaryEvidenceSelection> {
    return {
      rankingPolicyVersion: 'story_ranking_v1',
      sourceWindow: {
        windowId: 'reader-window-1',
        startedAt: new Date('2026-06-05T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:00:00.000Z'),
        selectedFeedItemIds: ['feed-post-1'],
        storyClusterIds: ['story-post-1'],
      },
      clusters: [
        {
          id: 'story-post-1',
          storyKey: 'reddit:t3_post_1',
          representativeFeedItemId: 'feed-post-1',
          duplicateFeedItemIds: [],
          interestIds: ['interest-1'],
          providerKeys: ['reddit'],
          score: 2.5,
          observedAtRange: {
            startedAt: new Date('2026-06-05T12:00:00.000Z'),
            endedAt: new Date('2026-06-05T12:10:00.000Z'),
          },
          whyImportant: ['Reddit discussion has ranked comments.'],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: 'feed-post-1',
          sourceItemId: 'source-post-1',
          sourceBindingId: 'source-binding-1',
          interestId: 'interest-1',
          providerKey: 'reddit',
          canonicalUrl: 'https://reddit.test/r/topic/comments/post_1',
          title: 'Root post',
          bodyPreview: 'Root post body.',
          publishedAt: new Date('2026-06-05T12:00:00.000Z'),
          observedAt: new Date('2026-06-05T12:10:00.000Z'),
          score: 2.5,
          whyImportant: ['Reddit discussion has ranked comments.'],
        },
      ],
    };
  }
}

const conversationUnit = (
  overrides: {
    readonly id: string;
    readonly providerUnitId: string;
    readonly body: string;
    readonly score: number;
    readonly replies?: number;
    readonly observedAt?: Date;
  },
): ConversationUnit => {
  const props: ConversationUnitProps = {
    id: overrides.id,
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'interest-1',
    sourceBindingId: 'source-binding-1',
    rootFeedItemId: 'feed-post-1',
    rootProviderItemId: 't3_post_1',
    providerKey: 'reddit',
    providerUnitId: overrides.providerUnitId,
    canonicalUrl: `https://reddit.test/r/topic/comments/post_1/_/${overrides.providerUnitId}`,
    body: overrides.body,
    publishedAt: new Date('2026-06-05T12:05:00.000Z'),
    observedAt:
      overrides.observedAt ?? new Date('2026-06-05T12:10:00.000Z'),
    threadExternalId: 't3_post_1',
    parentProviderUnitId: undefined,
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
