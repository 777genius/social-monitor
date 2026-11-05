import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { approvedScope, type Provider, type SourceSnapshot } from './social-source-private-input-contract';
import { scopedSnapshotSql, type ScopedReadPool } from './social-source-private-input-database';

export const syntheticId = (number: number): string => `00000000-0000-7000-8000-${number.toString().padStart(12, '0')}`;
export function syntheticSnapshots(): SourceSnapshot[] {
  const row = (provider: Provider, offset: number, config: Record<string, unknown>): SourceSnapshot => ({
    provider, scope: { ...approvedScope, interestId: syntheticId(offset), sourceBindingId: syntheticId(offset + 1), scanPolicyId: syntheticId(offset + 2) },
    catalogId: syntheticId(offset + 3), interestQuery: '  synthetic unchanged query  ', config,
    policy: { id: syntheticId(offset + 2), intervalSeconds: 181, freshnessSeconds: 359,
      retryBudget: 2, nextRunAt: '2026-09-25 03:04:05.123456+00' },
    capability: { id: syntheticId(offset + 4), sourceId: syntheticId(offset + 3), version: 3, schemaVersion: 1,
      config: { productionSafe: true, supportsCursor: true, requiresCredentials: false,
        ...(provider === 'reddit' ? { tenantCredentialOverrideSupported: true, appOnlyOAuth: true } : {}) } },
  });
  const primary = new URL('https://news.google.com/rss/search?q=a');
  primary.searchParams.set('q', 'abcdefghijklmnopqrstuvwxyz'.split('').join(' OR '));
  return [row('reddit', 7100, { query: '  synthetic original query  ', minScore: 0,
    scanPasses: Array.from({ length: 44 }, (_, index) => index % 2 === 0 ?
      { mode: 'search', query: `  synthetic pass ${index}  `, searchSort: 'new', allowedSubreddits: ['synthetic_b', 'synthetic_a'] } :
      { mode: 'listing', subreddit: `synthetic_${index}`, listing: 'new', maxItems: 7 }) }),
  row('rss', 7200, { extraFeedUrls: Array.from({ length: 24 }, (_, index) => `https://example.test/feeds/${24 - index}.xml`),
    feedUrl: primary.toString(), maxItemAgeHours: 744, maxItems: 30, mode: 'url', query: primary.toString() })];
}
export async function freshOutput(): Promise<{ outputRoot: string; worktree: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'social-sep24-synthetic-'));
  return { outputRoot: join(parent, 'inputs'), worktree: resolve(__dirname, '../..') };
}
export function fakeScopedPool(rows: Record<string, unknown>[]): {
  pool: ScopedReadPool; calls: { text: string; values?: readonly unknown[] }[]; release: jest.Mock; end: jest.Mock; on: jest.Mock;
} {
  const calls: { text: string; values?: readonly unknown[] }[] = [];
  const release = jest.fn(); const end = jest.fn(async () => undefined);
  const on = jest.fn();
  return { calls, release, end, on, pool: { connect: async () => ({ release, on,
    query: async (text, values) => { calls.push({ text, values }); return { rows: text === scopedSnapshotSql ? rows.map((row) => ({
      ...row, snapshot: typeof row.snapshot === 'string' ? row.snapshot : JSON.stringify(row.snapshot),
    })) : [] }; },
  }), end } };
}
