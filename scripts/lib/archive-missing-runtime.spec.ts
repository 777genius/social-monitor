import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runHnArchiveMissingWithRuntime } from '../import-hn-archive-missing';
import { runRssArchiveMissingWithRuntime } from '../import-rss-archive-missing';
import { planHnArchiveMissingPackets } from '../plan-hn-archive-missing-packets';
import { planRssArchiveMissingPackets } from '../plan-rss-archive-missing-packets';

const scope = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000002',
  interestId: '10000000-0000-4000-8000-000000000003',
  sourceBindingId: '10000000-0000-4000-8000-000000000004',
  scanPolicyId: '10000000-0000-4000-8000-000000000005',
};
const day = '2026-10-17';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const env = { MISSING_IMPORT_SCOPE_JSON: JSON.stringify(scope), MISSING_IMPORT_BINDING_CONFIG: '{}' };

(process.platform === 'linux' ? describe : describe.skip).each(['hn', 'rss'] as const)('%s archive runtime transaction boundary', provider => {
  it('reaches the first source insert inside the admitted outer READ WRITE transaction', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'archive-runtime-'));
    try {
      const items = provider === 'hn' ? [{
        externalId: 'hn:42', objectId: '42', title: 'Synthetic archive story', url: null,
        author: 'fixture', points: 7, createdAt: `${day}T08:00:00.000Z`, publishedUtcDate: day,
        storyText: 'Synthetic retained body', commentCount: 0, comments: [],
        retrievedForPass: 'ai-infrastructure', provenance: { fixture: true },
      }] : [{ guid: 'synthetic-rss-guid', title: 'Synthetic RSS story', publishedUtcDate: day,
        description: 'Synthetic retained body', link: null, provenance: { fixture: true } }];
      const manifest = { generatedAt: `${day}T09:00:00.000Z`, jobId: 'fixture',
        window: { from: day, to: day }, count: 1, items, itemsSha256: sha(JSON.stringify(items)),
        ...(provider === 'hn' ? { fetchErrors: 0 } : { enrichedWithLink: 0 }) };
      const entries = provider === 'hn'
        ? planHnArchiveMissingPackets(manifest, env) : planRssArchiveMissingPackets(manifest, env);
      const entry = entries[0]!;
      const inputRoot = join(root, 'input'), journalDir = join(root, 'journal');
      await mkdir(inputRoot, { mode: 0o700 }); await mkdir(journalDir, { mode: 0o700 });
      await writeFile(join(inputRoot, 'packet.json'), JSON.stringify(entry.packet) + '\n', { mode: 0o600 });
      await writeFile(join(inputRoot, 'plan.json'), JSON.stringify(entry.plan) + '\n', { mode: 0o600 });
      const plan = entry.plan as { semanticKey: string; planSha256: string; packetSha256: string };
      const events: string[] = [];
      let scoped = false, readWrite = false, outerTransactions = 0, sourceInserts = 0;
      const sql = { query: async (text: string, values?: unknown[]) => {
        if (text.startsWith('SELECT set_config')) {
          expect(values).toEqual([scope.tenantId, scope.workspaceId]); scoped = true;
        }
        return { rows: text.includes('WITH stamp') ? [{ allowed: scoped }] : [] };
      }, release: () => undefined };
      const raw = {
        $executeRawUnsafe: async (text: string) => {
          expect(events).toEqual([]); expect(text).toBe('SET TRANSACTION READ WRITE');
          events.push('read-write'); readWrite = true;
        },
        $queryRawUnsafe: async (text: string) => {
          if (text.includes('WITH stamp')) {
            expect(readWrite).toBe(true); events.push('role'); return [{ allowed: true }];
          }
          return [];
        },
        sourceItem: { findMany: async () => [], create: async () => {
          sourceInserts += 1; throw new Error('STOP_BEFORE_FIRST_SOURCE_INSERT');
        } }, feedItem: {},
      };
      const connection = { $transaction: async (work: (tx: typeof raw) => Promise<unknown>,
        options: { isolationLevel: string }) => {
        outerTransactions += 1; expect(options.isolationLevel).toBe('Serializable'); return work(raw);
      }, close: async () => undefined };
      const runtime = { testOwnerUid: process.getuid!(),
        openSql: () => ({ connect: async () => sql, end: async () => undefined }),
        openPrisma: async () => connection };
      const run = provider === 'hn' ? runHnArchiveMissingWithRuntime : runRssArchiveMissingWithRuntime;
      let failure: unknown;
      try {
        await run({ inputRoot, day, journalDir, semanticKey: plan.semanticKey,
          expectedPlanSha256: plan.planSha256, packetSha256: plan.packetSha256, correlationId: 'fixture' },
        'postgresql://fixture:fixture@localhost/fixture', runtime as unknown as Parameters<typeof run>[2]);
      } catch (error) { failure = error; }
      expect((failure as { originalError?: Error })?.originalError?.message)
        .toBe('STOP_BEFORE_FIRST_SOURCE_INSERT');
      expect(sourceInserts).toBe(1); expect(outerTransactions).toBe(1);
      expect(events).toEqual(['read-write', 'role']);
      const journal = JSON.parse(await readFile(join(journalDir,
        `${provider}-archive-qualified-${plan.semanticKey}.journal.json`), 'utf8'));
      expect(journal).toMatchObject({ status: 'started', inserted: 0 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
