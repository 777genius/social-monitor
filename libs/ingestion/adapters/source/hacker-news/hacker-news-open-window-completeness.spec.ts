import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceProviderScanContext } from '../../../ports';
import { HttpHackerNewsClient } from './http-hacker-news-client';
import { HackerNewsSourceProvider } from './hacker-news-source.provider';

describe('Hacker News current-day coverage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('does not mark a provably uncapped listing incomplete', async () => {
    globalThis.fetch = jest.fn(async (input: string | URL | Request) => ({
      ok: true, json: async () => String(input).includes('topstories.json') ? [1] :
        { id: 1, type: 'story', title: 'AI story', time: 1783418400 },
    } as Response)) as typeof fetch;
    const provider = new HackerNewsSourceProvider(new HttpHackerNewsClient(),
      { now: () => new Date('2026-07-07T12:00:00Z') });
    const context: SourceProviderScanContext = {
      tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
      sourceBindingId: 'binding', scanJobId: 'scan', correlationId: 'correlation',
      config: { maxItems: 1, targetPublishedWindow: {
        startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z',
      }, scanPasses: [{ mode: 'listing', listing: 'top' }] },
    };
    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'AI' }, context), context);
    expect(result.items).toHaveLength(1);
    expect(result.collection).toBeUndefined();
  });

  it.each(['listing', 'search'] as const)('reports %s truncation before client filtering', async mode => {
    globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes('topstories.json') ? [1, 2] : url.includes('/item/1.json')
        ? { id: 1, type: 'story', title: 'AI story', time: 1783418400 }
        : { nbHits: 3, nbPages: 2, page: 0, hits: [
            { objectID: '1', title: 'AI story', created_at_i: 1783418400, points: 5 },
            { objectID: '2', title: 'AI other', created_at_i: 1783418500, points: 5 },
          ] };
      return { ok: true, json: async () => body } as Response;
    }) as typeof fetch;
    const provider = new HackerNewsSourceProvider(new HttpHackerNewsClient(),
      { now: () => new Date('2026-07-07T12:00:00Z') });
    const context: SourceProviderScanContext = {
      tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'),
      sourceBindingId: 'binding', scanJobId: 'scan', correlationId: 'correlation',
      config: { maxItems: 1, targetPublishedWindow: {
        startInclusive: '2026-07-07T00:00:00Z', endExclusive: '2026-07-08T00:00:00Z',
      }, scanPasses: mode === 'listing' ? [{ mode: 'listing', listing: 'top' }] :
        [{ mode: 'search', target: 'story', query: 'AI' }] },
    };
    const result = await provider.scan(provider.planScan({ mode: 'search', query: 'AI' }, context), context);
    expect(result.items).toHaveLength(1);
    expect(result.collection).toEqual({ complete: false, backfillPending: true });
  });
});
