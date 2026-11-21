import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredHnArchiveScan } from './hn-archive-configured-scan.js';

test('uses every configured lane and bounds identity discovery without comment expansion', async () => {
  const original = { query: 'synthetic', includeComments: true, maxItems: 30,
    scanPasses: [{ mode: 'search', target: 'story', query: 'synthetic', includeComments: true }] };
  let seen: any;
  const provider: any = { key: () => 'hacker-news', validateBinding: () => ({ ok: true }),
    planScan: (query: unknown, context: any) => { seen = { query, context }; return { query, maxItems: 100 }; },
    scan: async () => ({ items: [], warnings: [] }) };
  const context: any = { tenantId: 'synthetic', workspaceId: 'synthetic', sourceBindingId: 'synthetic',
    correlationId: 'synthetic', scanJobId: 'synthetic', config: original };
  const scan = configuredHnArchiveScan({ provider, context, passes: original.scanPasses as any });
  await scan(new Date('2026-11-18T00:00:00Z'), new Date('2026-11-18T12:00:00Z'));
  assert.equal(seen.context.config.maxItems, 100);
  assert.equal(seen.context.config.scanPasses[0].includeComments, false);
  assert.equal(seen.context.config.targetPublishedWindow.endExclusive, '2026-11-18T12:00:00.000Z');
  assert.equal(original.scanPasses[0]!.includeComments, true);
  assert.throws(() => configuredHnArchiveScan({ provider, context, passes: [] }));
});
