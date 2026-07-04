import {
  PrismaSocialResearchResultCache,
  type PrismaSocialResearchResultCacheClient,
} from '@social-monitor/social-research/cache';
import type {
  SocialResearchResultCacheScope,
  SocialSearchRun,
  SocialThread,
} from '@social-monitor/social-research';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

describe('PrismaSocialResearchResultCache', () => {
  it('stores search runs per tenant/workspace scope and restores item dates', async () => {
    const client = new FakePrismaSocialResearchCacheClient();
    const cache = new PrismaSocialResearchResultCache(client, {
      clock: new FixedClock(new Date('2026-07-04T12:00:00.000Z')),
      ttlMs: 60_000,
    });

    await cache.writeSearch('cache-key', searchRun('first'), scope());

    await expect(cache.readSearch('cache-key', scope())).resolves.toMatchObject({
      items: [
        {
          itemId: 'reddit:first',
          publishedAt: new Date('2026-07-04T11:45:00.000Z'),
        },
      ],
    });
    await expect(
      cache.readSearch('cache-key', {
        tenantId: tenantId('tenant-other'),
        workspaceId: workspaceId('workspace-cache-test'),
      }),
    ).resolves.toBeNull();
  });

  it('returns null for expired entries and deletes them', async () => {
    const client = new FakePrismaSocialResearchCacheClient();
    const cache = new PrismaSocialResearchResultCache(client, {
      clock: new FixedClock(new Date('2026-07-04T12:00:00.000Z')),
      ttlMs: 1,
    });

    await cache.writeSearch('cache-key', searchRun('expired'), scope());
    await client.setExpiresAt('search', 'cache-key', new Date('2026-07-04T11:59:59.000Z'));

    await expect(cache.readSearch('cache-key', scope())).resolves.toBeNull();
    expect(client.hasEntry('search', 'cache-key')).toBe(false);
  });

  it('caps entries per scope and cache kind', async () => {
    const client = new FakePrismaSocialResearchCacheClient();
    const cache = new PrismaSocialResearchResultCache(client, {
      clock: new FixedClock(new Date('2026-07-04T12:00:00.000Z')),
      ttlMs: 60_000,
      maxEntries: 1,
    });

    await cache.writeSearch('first', searchRun('first'), scope());
    await cache.writeSearch('second', searchRun('second'), scope());
    await cache.writeThread('thread', socialThread(), scope());

    await expect(cache.readSearch('first', scope())).resolves.toBeNull();
    await expect(cache.readSearch('second', scope())).resolves.toMatchObject({
      warnings: ['second'],
    });
    await expect(cache.readThread('thread', scope())).resolves.toMatchObject({
      warnings: ['thread'],
    });
  });

  it('fails closed when durable cache is used without tenant/workspace scope', async () => {
    const cache = new PrismaSocialResearchResultCache(
      new FakePrismaSocialResearchCacheClient(),
      {
        clock: new FixedClock(new Date('2026-07-04T12:00:00.000Z')),
        ttlMs: 60_000,
      },
    );

    await expect(cache.readSearch('cache-key')).rejects.toThrow(
      'Prisma social research result cache requires tenant/workspace scope',
    );
  });
});

type CacheKind = 'search' | 'thread';

type StoredEntry = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly kind: CacheKind;
  readonly cacheKey: string;
  payload: unknown;
  expiresAt: Date;
  updatedAt: Date;
};

class FakePrismaSocialResearchCacheClient
  implements PrismaSocialResearchResultCacheClient
{
  private readonly entries = new Map<string, StoredEntry>();

  async $queryRaw<TValue = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<TValue> {
    const sql = query.join('?');
    if (!sql.includes('SELECT "payload", "expires_at"')) {
      throw new Error(`Unexpected query: ${sql}`);
    }

    const key = cacheEntryKey({
      tenantId: String(values[0]),
      workspaceId: String(values[1]),
      kind: values[2] as CacheKind,
      cacheKey: String(values[3]),
    });
    const entry = this.entries.get(key);

    return (entry === undefined
      ? []
      : [
          {
            payload: entry.payload,
            expires_at: entry.expiresAt,
          },
        ]) as TValue;
  }

  async $executeRaw(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<number> {
    const sql = query.join('?');
    if (sql.includes('INSERT INTO "social_research_result_cache_entries"')) {
      return this.upsertEntry(values);
    }

    if (sql.includes('"cache_key" IN (')) {
      return this.deleteOverflowEntries(values);
    }

    if (sql.includes('DELETE FROM "social_research_result_cache_entries"')) {
      return this.deleteEntry(values);
    }

    throw new Error(`Unexpected execute: ${sql}`);
  }

  async setExpiresAt(
    kind: CacheKind,
    cacheKey: string,
    expiresAt: Date,
  ): Promise<void> {
    const entry = this.entries.get(
      cacheEntryKey({
        tenantId: String(scope().tenantId),
        workspaceId: String(scope().workspaceId),
        kind,
        cacheKey,
      }),
    );
    if (entry !== undefined) {
      entry.expiresAt = expiresAt;
    }
  }

  hasEntry(kind: CacheKind, cacheKey: string): boolean {
    return this.entries.has(
      cacheEntryKey({
        tenantId: String(scope().tenantId),
        workspaceId: String(scope().workspaceId),
        kind,
        cacheKey,
      }),
    );
  }

  private upsertEntry(values: readonly unknown[]): number {
    const entry: StoredEntry = {
      tenantId: String(values[0]),
      workspaceId: String(values[1]),
      kind: values[2] as CacheKind,
      cacheKey: String(values[3]),
      payload: JSON.parse(String(values[4])),
      expiresAt: values[5] as Date,
      updatedAt: values[7] as Date,
    };

    this.entries.set(cacheEntryKey(entry), entry);

    return 1;
  }

  private deleteEntry(values: readonly unknown[]): number {
    return this.entries.delete(
      cacheEntryKey({
        tenantId: String(values[0]),
        workspaceId: String(values[1]),
        kind: values[2] as CacheKind,
        cacheKey: String(values[3]),
      }),
    )
      ? 1
      : 0;
  }

  private deleteOverflowEntries(values: readonly unknown[]): number {
    const tenant = String(values[0]);
    const workspace = String(values[1]);
    const kind = values[2] as CacheKind;
    const maxEntries = Number(values[6]);
    const overflowKeys = [...this.entries.values()]
      .filter(
        (entry) =>
          entry.tenantId === tenant &&
          entry.workspaceId === workspace &&
          entry.kind === kind,
      )
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.cacheKey.localeCompare(left.cacheKey),
      )
      .slice(maxEntries)
      .map((entry) => cacheEntryKey(entry));

    for (const key of overflowKeys) {
      this.entries.delete(key);
    }

    return overflowKeys.length;
  }
}

const cacheEntryKey = (entry: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly kind: CacheKind;
  readonly cacheKey: string;
}): string =>
  `${entry.tenantId}:${entry.workspaceId}:${entry.kind}:${entry.cacheKey}`;

const scope = (): SocialResearchResultCacheScope => ({
  tenantId: tenantId('tenant-cache-test'),
  workspaceId: workspaceId('workspace-cache-test'),
});

const searchRun = (suffix: string): SocialSearchRun => ({
  plan: validPlan(),
  items: [
    {
      itemId: `reddit:${suffix}`,
      sourceKey: 'reddit',
      canonicalUrl: `https://www.reddit.com/r/test/comments/${suffix}`,
      title: suffix,
      body: suffix,
      publishedAt: new Date('2026-07-04T11:45:00.000Z'),
    },
  ],
  warnings: [suffix],
  partial: false,
});

const socialThread = (): SocialThread => ({
  root: {
    itemId: 'reddit:thread',
    sourceKey: 'reddit',
    canonicalUrl: 'https://www.reddit.com/r/test/comments/thread',
    title: 'Thread',
    body: 'Thread body',
    publishedAt: new Date('2026-07-04T11:30:00.000Z'),
  },
  units: [
    {
      unitId: 'comment-1',
      body: 'Comment',
      publishedAt: new Date('2026-07-04T11:35:00.000Z'),
    },
  ],
  warnings: ['thread'],
});

const validPlan = () =>
  ({
    intent: {
      topic: 'AI developer tools',
      sources: ['reddit'],
    },
    normalizedTopic: 'AI developer tools',
    window: '30d',
    depth: 'balanced',
    goal: 'research',
    lanes: [
      {
        laneId: 'reddit:general:ai-developer-tools',
        sourceKey: 'reddit',
        kind: 'general',
        operation: 'search',
        query: 'AI developer tools',
        priority: 100,
        maxItems: 40,
        budgetWeight: 1,
        reason: 'primary topic search',
      },
    ],
    budgets: [
      {
        sourceKey: 'reddit',
        maxLanes: 6,
        maxItemsPerLane: 40,
        includeEnrichment: true,
      },
    ],
    warnings: [],
  }) as const;
