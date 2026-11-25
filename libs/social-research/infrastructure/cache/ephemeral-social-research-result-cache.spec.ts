import type { SocialSearchRun } from '@social-monitor/social-research';
import { EphemeralSocialResearchResultCache } from '@social-monitor/social-research/cache';
import { FixedClock } from '@social-monitor/shared-kernel';

describe('EphemeralSocialResearchResultCache', () => {
  it('returns cached search runs before ttl expiry', async () => {
    const cache = new EphemeralSocialResearchResultCache({
      clock: new FixedClock(new Date('2026-07-04T10:00:00.000Z')),
      ttlMs: 1_000,
    });
    const run = searchRun('first');

    await cache.writeSearch('key-1', run);

    await expect(cache.readSearch('key-1')).resolves.toBe(run);
  });

  it('expires cached search runs after ttl', async () => {
    let now = new Date('2026-07-04T10:00:00.000Z');
    const cache = new EphemeralSocialResearchResultCache({
      clock: { now: () => now },
      ttlMs: 1_000,
    });

    await cache.writeSearch('key-1', searchRun('first'));
    now = new Date('2026-07-04T10:00:02.000Z');

    await expect(cache.readSearch('key-1')).resolves.toBeNull();
  });

  it('evicts the oldest entries when max entries is exceeded', async () => {
    let now = new Date('2026-07-04T10:00:00.000Z');
    const cache = new EphemeralSocialResearchResultCache({
      clock: { now: () => now },
      maxEntries: 1,
    });
    await cache.writeSearch('key-1', searchRun('first'));
    now = new Date('2026-07-04T10:00:01.000Z');
    await cache.writeSearch('key-2', searchRun('second'));

    await expect(cache.readSearch('key-1')).resolves.toBeNull();
    await expect(cache.readSearch('key-2')).resolves.toMatchObject({
      warnings: ['second'],
    });
  });
});

const searchRun = (warning: string): SocialSearchRun => ({
  plan: {
    intent: {
      topic: 'AI developer tools',
      sources: ['reddit'],
    },
    normalizedTopic: 'AI developer tools',
    window: '30d',
    depth: 'balanced',
    goal: 'research',
    lanes: [],
    budgets: [],
    warnings: [],
  },
  items: [],
  warnings: [warning],
  partial: false,
});
