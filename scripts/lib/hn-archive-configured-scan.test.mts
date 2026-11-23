import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredHnArchiveScan } from './hn-archive-configured-scan.js';

test('uses every configured lane and bounds identity discovery without comment expansion', async () => {
  const original = { query: 'synthetic', includeComments: true, maxItems: 30,
    scanPasses: [{ mode: 'search', target: 'story', query: 'synthetic', includeComments: true }] };
  let seen: unknown;
  const provider = { key: () => 'hacker-news', validateBinding: () => ({ ok: true }),
    planScan: (query: unknown, context: unknown) => { seen = { query, context }; return { query, maxItems: 100 }; },
    scan: async () => ({ items: [], warnings: [] }) } as unknown as Parameters<typeof configuredHnArchiveScan>[0]['provider'];
  const context = { tenantId: 'synthetic', workspaceId: 'synthetic', sourceBindingId: 'synthetic',
    correlationId: 'synthetic', scanJobId: 'synthetic', config: original } as unknown as Parameters<typeof configuredHnArchiveScan>[0]['context'];
  const passes = original.scanPasses as unknown as Parameters<typeof configuredHnArchiveScan>[0]['passes'];
  const scan = configuredHnArchiveScan({ provider, context, passes });
  await scan(new Date('2026-11-18T00:00:00Z'), new Date('2026-11-18T12:00:00Z'));
  const captured = seen as { context: { config: { maxItems: number; scanPasses: { includeComments: boolean }[];
    targetPublishedWindow: { endExclusive: string } } } };
  assert.equal(captured.context.config.maxItems, 100);
  assert.equal(captured.context.config.scanPasses[0]!.includeComments, false);
  assert.equal(captured.context.config.targetPublishedWindow.endExclusive, '2026-11-18T12:00:00.000Z');
  assert.equal(original.scanPasses[0]!.includeComments, true);
  assert.throws(() => configuredHnArchiveScan({ provider, context, passes: [] }));
});
