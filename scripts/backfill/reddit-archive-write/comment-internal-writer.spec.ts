import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeInternalRedditArchiveCommentWrite, type RedditArchiveCommentWrites } from './comment-internal-writer';
import { commentPlan } from './comment-plan.spec-support';
import { writeExclusive } from '../../lib/github-archive-finite-journal';
import type * as FileSystem from 'node:fs/promises';
import type * as JournalFiles from '../../lib/github-archive-finite-journal';
const filesystem = jest.requireActual<typeof FileSystem>('node:fs/promises');
const journalFiles = jest.requireActual<typeof JournalFiles>('../../lib/github-archive-finite-journal');

afterEach(() => jest.restoreAllMocks());

describe('comments-only consumed lifecycle', () => {
  it.each(['identity conflict', 'partial insertion', 'readback mismatch'])('leaves STARTED and refuses replay after %s', async phase => {
    const plan = commentPlan();
    const directory = await mkdtemp(join(tmpdir(), 'TEST-reddit-archive-comments-'));
    const path = join(directory, `reddit-archive-comments-qualified-${plan.semanticKey}.journal.json`);
    let committed = false;
    const persist = jest.fn(async () => ({ inserted: phase === 'partial insertion' ? 1 : 2, projected: 2 }));
    const writes: RedditArchiveCommentWrites = {
      assertParentAndMissing: async () => { if (phase === 'identity conflict') throw new Error('Identity exists'); },
      persist, present: async () => phase === 'readback mismatch' ? 1 : 2,
    };
    const withAtomicWrites = jest.fn(async (_plan: typeof plan, run: (w: RedditArchiveCommentWrites) => Promise<unknown>) => {
      const value = await run(writes); committed = true; return value;
    });
    const dependencies = { withAtomicWrites } as Parameters<typeof executeInternalRedditArchiveCommentWrite>[0]['dependencies'];
    const input = { plan, expectedPlanSha256: plan.planSha256, semanticKey: plan.semanticKey,
      correlationId: 'TEST-archive-comments', journalPath: path, dependencies };
    const lifecycle = { consumeStartedJournal: async (_dir: unknown, _name: string, journal: unknown) =>
      writeExclusive(path, { ...(journal as object), status: 'started' }) };
    try {
      await expect(executeInternalRedditArchiveCommentWrite(input, lifecycle)).rejects.toThrow();
      expect(committed).toBe(false);
      const first = await readFile(path, 'utf8');
      expect(JSON.parse(first)).toMatchObject({ status: 'started', kind: 'reddit-archive-comments',
        originalDays: ['2026-10-01', '2026-10-02'], rawSha256: plan.rawSha256 });
      await expect(executeInternalRedditArchiveCommentWrite(input, lifecycle)).rejects.toHaveProperty('code', 'EEXIST');
      expect(await readFile(path, 'utf8')).toBe(first);
      expect(withAtomicWrites).toHaveBeenCalledTimes(1);
      expect(persist).toHaveBeenCalledTimes(phase === 'identity conflict' ? 0 : 1);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('refuses a changed or post-import plan identity before claiming any lifecycle', async () => {
    const plan = commentPlan(); const claim = jest.fn(); const transaction = jest.fn();
    for (const invalid of [{ ...plan, semanticKey: 'old-post-claim' },
      { ...plan, candidates: plan.candidates.slice(0, 1) }]) {
      await expect(executeInternalRedditArchiveCommentWrite({ plan: invalid,
        expectedPlanSha256: plan.planSha256, semanticKey: plan.semanticKey,
        correlationId: 'TEST', journalPath: '/unreached', dependencies: { withAtomicWrites: transaction },
      }, { consumeStartedJournal: claim })).rejects.toThrow('plan mismatch');
    }
    expect(claim).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });
  it.each([true, false])('preserves work failure before owned close failure, or refuses successful work when close fails (workFails=%s)', async workFails => {
    const plan = commentPlan(), primary = new Error('Primary work failed'), cleanup = new Error('Owned close failed');
    const close = jest.fn(async () => { throw cleanup; });
    const handle = { fd: 17, stat: async () => ({ dev: 1, ino: 2 }), sync: async () => {}, close };
    jest.spyOn(filesystem, 'open').mockResolvedValue(handle as never);
    jest.spyOn(filesystem, 'lstat').mockResolvedValue({ isDirectory: () => true, dev: 1, ino: 2 } as never);
    jest.spyOn(filesystem, 'rename').mockResolvedValue(undefined);
    jest.spyOn(journalFiles, 'writeExclusive').mockResolvedValue(undefined);
    const withAtomicWrites: Parameters<typeof executeInternalRedditArchiveCommentWrite>[0]['dependencies']['withAtomicWrites'] =
      async (_plan, work) => {
        if (workFails) throw primary;
        return work({ assertParentAndMissing: async () => {}, persist: async () => ({ inserted: 2, projected: 2 }), present: async () => 2 });
      };
    await expect(executeInternalRedditArchiveCommentWrite({ plan, expectedPlanSha256: plan.planSha256,
      semanticKey: plan.semanticKey, correlationId: 'TEST',
      journalPath: `/synthetic/reddit-archive-comments-qualified-${plan.semanticKey}.journal.json`, dependencies: { withAtomicWrites },
    }, { consumeStartedJournal: async () => {} })).rejects.toBe(workFails ? primary : cleanup);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('leaves a caller-owned journal handle open after work failure', async () => {
    const plan = commentPlan(), primary = new Error('Caller work failed');
    const close = jest.fn(), handle = { stat: async () => ({ dev: 1, ino: 2 }), close };
    jest.spyOn(filesystem, 'lstat').mockResolvedValue({ isDirectory: () => true, dev: 1, ino: 2 } as never);
    await expect(executeInternalRedditArchiveCommentWrite({ plan, expectedPlanSha256: plan.planSha256,
      semanticKey: plan.semanticKey, correlationId: 'TEST', journalDirectory: handle as never,
      journalPath: `/synthetic/reddit-archive-comments-qualified-${plan.semanticKey}.journal.json`,
      dependencies: { withAtomicWrites: async () => { throw primary; } },
    }, { consumeStartedJournal: async () => {} })).rejects.toBe(primary);
    expect(close).not.toHaveBeenCalled();
  });
});
