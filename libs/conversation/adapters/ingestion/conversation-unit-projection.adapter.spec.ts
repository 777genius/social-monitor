import { tenantId, workspaceId, type IdGenerator } from '@social-monitor/shared-kernel';

import { InMemoryConversationUnitRepository } from '../persistence/in-memory-conversation-unit.repository';
import { ConversationUnitProjectionAdapter } from './conversation-unit-projection.adapter';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `conversation-unit-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('ConversationUnitProjectionAdapter', () => {
  it('projects conversation units onto projected root feed items and skips orphans', async () => {
    const repository = new InMemoryConversationUnitRepository();
    const adapter = new ConversationUnitProjectionAdapter(
      repository,
      new SequenceIdGenerator(),
    );

    const result = await adapter.project({
      tenantId: tenantId('tenant-conversation-projection-test'),
      workspaceId: workspaceId('workspace-conversation-projection-test'),
      interestId: 'interest-1',
      sourceBindingId: 'source-binding-1',
      providerKey: 'reddit',
      observedAt: new Date('2026-06-05T12:00:00.000Z'),
      projectedFeedItems: [
        {
          sourceItemId: 'source-item-1',
          sourceExternalId: 'reddit:t3_post_1',
          feedItemId: 'feed-item-1',
        },
      ],
      conversationUnits: [
        {
          rootExternalId: 'reddit:t3_post_1',
          rootProviderItemId: 't3_post_1',
          providerUnitId: 't1_comment_1',
          canonicalUrl: 'https://reddit.test/r/topic/comments/post_1/_/comment_1',
          body: 'Useful top comment.',
          authorHandle: 'commenter',
          publishedAt: new Date('2026-06-05T12:01:00.000Z'),
          threadExternalId: 't3_post_1',
          depth: 0,
          role: 'top_level_comment',
          metadata: {
            kind: 'reddit_comment',
            subreddit: 'topic',
            score: 42,
            replies: 3,
            depth: 0,
            role: 'top_level_comment',
          },
        },
        {
          rootExternalId: 'reddit:t3_missing',
          rootProviderItemId: 't3_missing',
          providerUnitId: 't1_orphan',
          canonicalUrl: 'https://reddit.test/r/topic/comments/missing/_/orphan',
          body: 'Orphan comment.',
          publishedAt: new Date('2026-06-05T12:02:00.000Z'),
          threadExternalId: 't3_missing',
          depth: 0,
          role: 'top_level_comment',
          metadata: {
            kind: 'reddit_comment',
            subreddit: 'topic',
            score: 100,
          },
        },
      ],
    });

    expect(result).toEqual({
      projected: 1,
      skippedOrphans: 1,
      skippedInvalid: 0,
    });
    expect(repository.all().map((unit) => unit.toSnapshot())).toEqual([
      expect.objectContaining({
        id: 'conversation-unit-1',
        rootFeedItemId: 'feed-item-1',
        providerUnitId: 't1_comment_1',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
  });
});
