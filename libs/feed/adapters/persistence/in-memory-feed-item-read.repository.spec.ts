import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem } from '../../domain';
import { InMemoryFeedItemReadRepository } from './in-memory-feed-item-read.repository';

const makeItem = (params: {
  readonly id: string;
  readonly sourceItemId: string;
  readonly tenant?: string;
  readonly topicId?: string;
  readonly canonicalUrl: string;
}) =>
  FeedItem.publish({
    id: params.id,
    tenantId: tenantId(params.tenant ?? 'tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: params.topicId ?? 'topic-1',
    sourceItemId: params.sourceItemId,
    sourceBindingId: 'binding-1',
    canonicalUrl: params.canonicalUrl,
    title: `Title ${params.id}`,
    bodyPreview: `Body ${params.id}`,
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
  });

describe('InMemoryFeedItemReadRepository', () => {
  it('dedupes feed items by normalized canonical URL inside tenant scope', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'feed-1',
      sourceItemId: 'source-1',
      canonicalUrl: 'https://Example.test/story?utm_source=email&b=2&a=1#comments',
    }));
    repository.upsert(makeItem({
      id: 'feed-2',
      sourceItemId: 'source-2',
      canonicalUrl: 'https://example.test/story?a=1&b=2',
    }));
    repository.upsert(makeItem({
      id: 'feed-3',
      sourceItemId: 'source-3',
      tenant: 'tenant-2',
      canonicalUrl: 'https://example.test/story?a=1&b=2',
    }));

    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(repository.list({
      tenantId: tenantId('tenant-2'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });

  it('dedupes canonical URLs inside topic scope but keeps the same URL for another topic', async () => {
    const repository = new InMemoryFeedItemReadRepository();
    repository.upsert(makeItem({
      id: 'topic-1-feed-1',
      sourceItemId: 'topic-1-source-1',
      topicId: 'topic-1',
      canonicalUrl: 'https://example.test/story?utm_source=email&a=1',
    }));
    repository.upsert(makeItem({
      id: 'topic-1-feed-2',
      sourceItemId: 'topic-1-source-2',
      topicId: 'topic-1',
      canonicalUrl: 'https://example.test/story?a=1',
    }));
    repository.upsert(makeItem({
      id: 'topic-2-feed-1',
      sourceItemId: 'topic-2-source-1',
      topicId: 'topic-2',
      canonicalUrl: 'https://example.test/story?a=1',
    }));

    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
    await expect(repository.list({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-2',
      limit: 10,
    })).resolves.toEqual({
      items: [
        expect.objectContaining({
          toSnapshot: expect.any(Function),
        }),
      ],
      nextCursor: undefined,
    });
  });
});
