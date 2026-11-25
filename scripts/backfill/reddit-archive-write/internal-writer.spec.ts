import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planRedditArchive } from './plan';
import { executeInternalRedditArchiveWrite, type RedditArchiveWrites } from './internal-writer';
import { writeExclusive } from '../../lib/github-archive-finite-journal';
import { redditArchiveHash as hash } from '../../lib/reddit-archive-finite-policy';

const uuid = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const bytes = Buffer.from(JSON.stringify({ data: [{ id: 'test123', subreddit: 'LocalLLaMA', title: 'Fixture', selftext: 'Source.',
    created_utc: 1791115200, retrieved_on: 1791115210, score: 0, over_18: false, removed_by_category: null,
    permalink: '/r/LocalLLaMA/comments/test123/fixture/' }] }));
  const bindingConfig = JSON.stringify({ scanPasses: [{ mode: 'listing', subreddit: 'LocalLLaMA', listing: 'new', minScore: 0 }] });
  const packet = Buffer.from(JSON.stringify({ schemaVersion: 1, providerKey: 'reddit', provenance: {
    sourceUrl: 'https://arctic-shift.photon-reddit.com/api/posts/ids?ids=test123', acquiredAt: '2026-10-15T09:20:31.716Z',
    rawSha256: hash(bytes), day: '2026-10-04' }, nativeIds: ['test123'],
  scope: { tenantId: uuid(1), workspaceId: uuid(2), interestId: uuid(3), sourceBindingId: uuid(4), scanPolicyId: uuid(5) },
  bindingConfig, bindingConfigSha256: hash(bindingConfig), matchedLaneOrdinal: 1,
  scanPolicy: { id: uuid(5), intervalSeconds: 3600, freshnessSeconds: 7200, retryBudget: 0 } }));
  return { bytes, packet };
}
describe('Reddit archive atomic missing-only operation', () => {
  it('pins actual policy and raw bytes before producing a plan', () => {
    const { bytes, packet } = fixture(), plan = planRedditArchive(bytes, packet);
    expect(plan.candidates[0]!.externalId).toBe('reddit:t3_test123');
    expect(() => planRedditArchive(Buffer.from('{}'), packet)).toThrow();
    const changed = JSON.parse(packet.toString()); changed.scanPolicy.id = uuid(6);
    expect(() => planRedditArchive(bytes, Buffer.from(JSON.stringify(changed)))).toThrow();
  });
  it('claims once, refuses an existing identity before persist, and leaves original UNKNOWN reconciliation evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'TEST-reddit-archive-')), { bytes, packet } = fixture();
    const p = planRedditArchive(bytes, packet), file = join(dir, `reddit-archive-qualified-${p.semanticKey}.journal.json`);
    const persist = jest.fn(), existing = new Error('Existing canonical identity');
    const writes: RedditArchiveWrites = { assertMissing: async () => { throw existing; }, persist, present: async () => 0 };
    const input = { plan: p, expectedPlanSha256: p.planSha256, semanticKey: p.semanticKey,
      correlationId: 'TEST-reddit-archive', journalPath: file,
      dependencies: { withAtomicWrites: async <T>(_p: typeof p, run: (w: RedditArchiveWrites) => Promise<T>) => run(writes) } };
    const lifecycle = { scanJobId: () => uuid(8), consumeStartedJournal: async (_dir: unknown, _name: string, journal: unknown) =>
      writeExclusive(file, { ...(journal as object), status: 'started' }) };
    try {
      await expect(executeInternalRedditArchiveWrite(input, lifecycle)).rejects.toBe(existing);
      expect(persist).not.toHaveBeenCalled(); expect(JSON.parse(await readFile(file, 'utf8')).status).toBe('started');
      await expect(executeInternalRedditArchiveWrite(input, lifecycle)).rejects.toHaveProperty('code', 'EEXIST');
      expect(persist).not.toHaveBeenCalled();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('keeps STARTED evidence when post-write references do not prove the whole pinned batch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'TEST-reddit-archive-')), { bytes, packet } = fixture();
    const p = planRedditArchive(bytes, packet), file = join(dir, `reddit-archive-qualified-${p.semanticKey}.journal.json`);
    let committed = false;
    const writes: RedditArchiveWrites = { assertMissing: async () => undefined,
      persist: async () => ({ inserted: 1, projected: 1 }), present: async () => 0 };
    try {
      await expect(executeInternalRedditArchiveWrite({ plan: p, expectedPlanSha256: p.planSha256,
        semanticKey: p.semanticKey, correlationId: 'TEST-reddit-archive', journalPath: file,
        dependencies: { withAtomicWrites: async (_plan, run) => { const value = await run(writes); committed = true; return value; } },
      }, { scanJobId: () => uuid(8), consumeStartedJournal: async (_dir, _name, journal) =>
        writeExclusive(file, { ...journal, status: 'started' }) })).rejects.toThrow('readback uncertain');
      expect(committed).toBe(false); expect(JSON.parse(await readFile(file, 'utf8')).status).toBe('started');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
