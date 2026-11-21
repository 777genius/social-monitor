import assert from 'node:assert/strict';
import { register } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// The repository's Node contract tests use the same extensionless TS resolver.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    try { return await nextResolve(specifier, context); }
    catch (error) {
      if (specifier.startsWith('./') && !specifier.endsWith('.ts')) return nextResolve(specifier + '.ts', context);
      throw error;
    }
  }
`)}`, import.meta.url);

const source = (path: string) => pathToFileURL(resolve(process.cwd(), path)).href;
const { generateHnArchiveManifest } = await import(source('scripts/lib/hn-archive-manifest-generation.ts'));
const { planHnArchiveMissingPackets } = await import(source('scripts/plan-hn-archive-missing-packets.ts'));
const { executeHnArchiveMissingImport } = await import(source('scripts/lib/hn-archive-missing-normalizer.ts'));

test('generated archive passes the real planner and missing-only import contract', async () => {
  const createdAt = '2026-11-18T12:00:00.000Z';
  const manifest = await generateHnArchiveManifest({
    candidates: [{ id: 42, day: '2026-11-18', createdAt, pass: 'fixture' }],
    from: '2026-11-18', to: '2026-11-18', generatedAt: new Date('2026-11-21T12:00:00Z'),
    jobId: 'synthetic', reconciliationSha256: 'a'.repeat(64),
    read: async () => JSON.stringify({ id: 42, type: 'story', created_at: createdAt, title: 'Synthetic story',
      author: 'fixture-author', url: null, text: null, points: 3, children: [{ id: 43, type: 'comment',
        created_at: '2026-11-18T12:01:00.000Z', author: 'fixture-author', text: 'Synthetic comment', children: [] }] }),
  });
  const scope = { tenantId: '10000000-0000-4000-8000-000000000001', workspaceId: '10000000-0000-4000-8000-000000000002',
    interestId: '10000000-0000-4000-8000-000000000003', sourceBindingId: '10000000-0000-4000-8000-000000000004',
    scanPolicyId: '10000000-0000-4000-8000-000000000005' };
  const packets = planHnArchiveMissingPackets(manifest, { MISSING_IMPORT_SCOPE_JSON: JSON.stringify(scope),
    MISSING_IMPORT_BINDING_CONFIG: '{}' });
  assert.equal(packets.length, 1);
  const plan = packets[0].plan;
  const present = new Set<string>();
  const projected: unknown[] = [];
  const dependencies = {
    existingIds: async (ids: string[]) => ids.filter(id => present.has(id)),
    insertMissing: async (items: Array<{ externalId: string; publishedAt: Date }>) => {
      assert.equal(items[0]!.publishedAt.toISOString(), createdAt);
      items.forEach(item => present.add(item.externalId));
      return items.length;
    },
    present: async (ids: string[]) => ids.filter(id => present.has(id)).length,
    projectComments: async (items: unknown[]) => { projected.push(...items); return items.length; },
  };
  const first = await executeHnArchiveMissingImport(plan, manifest, dependencies);
  const second = await executeHnArchiveMissingImport(plan, manifest, dependencies);
  assert.deepEqual(first, { inserted: 1, alreadyPresent: 0, postWritePresent: 1 });
  assert.deepEqual(second, { inserted: 0, alreadyPresent: 1, postWritePresent: 1 });
  assert.equal(projected.length, 1);
});
