import {
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import {
  ConversationUnit,
  type ConversationUnitProps,
} from '../entities/conversation-unit';
import { contentHashForConversationUnit } from '../value-objects/conversation-unit-content-hash';
import { ConversationBundleBuilder } from './conversation-bundle-builder';

describe('ConversationBundleBuilder', () => {
  it('attaches parent ancestry to a ranked reply without letting the parent replace the ranked unit', () => {
    const bundles = new ConversationBundleBuilder().build({
      units: [
        conversationUnit({
          id: 'parent',
          providerUnitId: 't1_parent',
          body: 'Parent comment gives the setup.',
          score: 1,
          depth: 0,
          role: 'top_level_comment',
        }),
        conversationUnit({
          id: 'reply',
          providerUnitId: 't1_reply',
          parentProviderUnitId: 't1_parent',
          body: 'High-score reply carries the useful signal.',
          score: 120,
          replies: 4,
          depth: 1,
          role: 'reply',
        }),
      ],
      now: new Date('2026-06-05T12:30:00.000Z'),
      limitPerRoot: 1,
      maxAncestorDepth: 3,
      maxTotalUnitsPerRoot: 4,
    });

    expect(bundles[0]?.units).toHaveLength(1);
    expect(bundles[0]?.units[0]).toMatchObject({
      conversationUnitId: 'reply',
      providerUnitId: 't1_reply',
      parentProviderUnitId: 't1_parent',
      threadExternalId: 't3_post_1',
      selectionReason: 'ranked',
      ancestry: [
        {
          conversationUnitId: 'parent',
          providerUnitId: 't1_parent',
          selectionReason: 'ancestor_context',
          depth: 0,
          role: 'top_level_comment',
        },
      ],
    });
  });

  it('keeps ranked slots for ranked comments when ancestor slots are capped', () => {
    const bundles = new ConversationBundleBuilder().build({
      units: [
        conversationUnit({
          id: 'parent',
          providerUnitId: 't1_parent',
          body: 'Low-score parent.',
          score: 1,
        }),
        conversationUnit({
          id: 'first-reply',
          providerUnitId: 't1_first_reply',
          parentProviderUnitId: 't1_parent',
          body: 'First high-score reply.',
          score: 130,
          depth: 1,
          role: 'reply',
        }),
        conversationUnit({
          id: 'second-reply',
          providerUnitId: 't1_second_reply',
          parentProviderUnitId: 't1_parent',
          body: 'Second high-score reply.',
          score: 120,
          depth: 1,
          role: 'reply',
        }),
      ],
      now: new Date('2026-06-05T12:30:00.000Z'),
      limitPerRoot: 2,
      maxAncestorDepth: 3,
      maxTotalUnitsPerRoot: 3,
    });

    expect(bundles[0]?.units.map((unit) => unit.conversationUnitId)).toEqual([
      'first-reply',
      'second-reply',
    ]);
    expect(
      bundles[0]?.units.reduce(
        (total, unit) => total + unit.ancestry.length,
        0,
      ),
    ).toBeLessThanOrEqual(1);
  });

  it('leaves missing or cyclic parent chains as bounded context instead of failing', () => {
    const bundles = new ConversationBundleBuilder().build({
      units: [
        conversationUnit({
          id: 'missing-parent-reply',
          providerUnitId: 't1_missing_parent_reply',
          parentProviderUnitId: 't1_missing_parent',
          body: 'Reply with a missing parent still has standalone signal.',
          score: 130,
          depth: 1,
          role: 'reply',
        }),
        conversationUnit({
          id: 'cycle-a',
          providerUnitId: 't1_cycle_a',
          parentProviderUnitId: 't1_cycle_b',
          body: 'Cycle A.',
          score: 120,
          depth: 1,
          role: 'reply',
        }),
        conversationUnit({
          id: 'cycle-b',
          providerUnitId: 't1_cycle_b',
          parentProviderUnitId: 't1_cycle_a',
          body: 'Cycle B.',
          score: 110,
          depth: 1,
          role: 'reply',
        }),
      ],
      now: new Date('2026-06-05T12:30:00.000Z'),
      limitPerRoot: 2,
      maxAncestorDepth: 3,
      maxTotalUnitsPerRoot: 6,
    });

    expect(bundles[0]?.units[0]).toMatchObject({
      conversationUnitId: 'missing-parent-reply',
      ancestry: [],
    });
    expect(bundles[0]?.units[1]?.ancestry).toHaveLength(1);
  });

  it('prefers top-level comments when provider score ties with a deep reply', () => {
    const publishedAt = new Date('2026-06-05T12:05:00.000Z');
    const bundles = new ConversationBundleBuilder().build({
      units: [
        conversationUnit({
          id: 'deep-reply',
          providerUnitId: 't1_deep_reply',
          body: 'Deep reply with the same score.',
          score: 100,
          depth: 4,
          role: 'reply',
          publishedAt,
        }),
        conversationUnit({
          id: 'top-level',
          providerUnitId: 't1_top_level',
          body: 'Top-level comment with the same score.',
          score: 100,
          depth: 0,
          role: 'top_level_comment',
          publishedAt,
        }),
      ],
      now: new Date('2026-06-05T12:30:00.000Z'),
      limitPerRoot: 1,
    });

    expect(bundles[0]?.units[0]?.conversationUnitId).toBe('top-level');
  });
});

const conversationUnit = (
  overrides: {
    readonly id: string;
    readonly providerUnitId: string;
    readonly body: string;
    readonly score: number;
    readonly replies?: number;
    readonly parentProviderUnitId?: string;
    readonly depth?: number;
    readonly role?: 'top_level_comment' | 'reply';
    readonly publishedAt?: Date;
  },
): ConversationUnit => {
  const depth = overrides.depth ?? 0;
  const role = overrides.role ?? 'top_level_comment';
  const props: ConversationUnitProps = {
    id: overrides.id,
    tenantId: tenantId('tenant-conversation-bundle-test'),
    workspaceId: workspaceId('workspace-conversation-bundle-test'),
    interestId: 'interest-1',
    sourceBindingId: 'source-binding-1',
    rootFeedItemId: 'feed-post-1',
    rootProviderItemId: 't3_post_1',
    providerKey: 'reddit',
    providerUnitId: overrides.providerUnitId,
    canonicalUrl: `https://reddit.test/r/topic/comments/post_1/_/${overrides.providerUnitId}`,
    body: overrides.body,
    publishedAt: overrides.publishedAt ?? new Date('2026-06-05T12:05:00.000Z'),
    observedAt: new Date('2026-06-05T12:10:00.000Z'),
    threadExternalId: 't3_post_1',
    parentProviderUnitId: overrides.parentProviderUnitId,
    depth,
    role,
    providerMetadata: {
      kind: 'reddit_comment',
      subreddit: 'topic',
      score: overrides.score,
      replies: overrides.replies ?? 0,
      depth,
      role,
    },
    contentHash: '',
    schemaVersion: 1,
  };

  return ConversationUnit.capture({
    ...props,
    contentHash: contentHashForConversationUnit(props),
  });
};
