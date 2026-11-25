import { constants } from 'node:fs';
import { lstat, open, rename, type FileHandle } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { RedditArchivePlan } from './plan';
import { archiveNeed as need, redditArchiveHash as hash } from '../../lib/reddit-archive-finite-policy';
import { writeExclusive } from '../../lib/github-archive-finite-journal';

export type RedditArchiveWrites = Readonly<{
  assertMissing: (jobId: string) => Promise<void>;
  persist: () => Promise<Readonly<{ inserted: number; projected: number }>>;
  present: () => Promise<number>;
}>;
export type RedditArchiveAtomicDependencies = Readonly<{
  withAtomicWrites: <T>(plan: RedditArchivePlan, work: (writes: RedditArchiveWrites) => Promise<T>) => Promise<T>;
}>;
export type RedditArchiveLifecycle = Readonly<{
  scanJobId: (key: string) => string;
  consumeStartedJournal: (directory: FileHandle, name: string, journal: Readonly<Record<string, unknown>>) => Promise<void>;
}>;
export async function executeInternalRedditArchiveWrite(input: {
  plan: RedditArchivePlan; expectedPlanSha256: string; semanticKey: string; correlationId: string;
  journalPath: string; journalDirectory?: FileHandle; dependencies: RedditArchiveAtomicDependencies;
}, lifecycle: RedditArchiveLifecycle) {
  const p = structuredClone(input.plan), { planSha256, ...unsigned } = p;
  need(planSha256 === input.expectedPlanSha256 && hash(JSON.stringify(unsigned)) === planSha256 &&
    p.semanticKey === input.semanticKey && p.providerKey === 'reddit' && p.candidates.length >= 1 &&
    p.candidates.length <= 3 && hash(JSON.stringify(p.candidates)) === p.itemsSha256, 'Reddit archive plan mismatch');
  need(/^[a-zA-Z0-9._:-]{1,128}$/u.test(input.correlationId), 'Reddit archive correlation invalid');
  const path = resolve(input.journalPath), name = `reddit-archive-qualified-${p.semanticKey}.journal.json`;
  need(basename(path) === name, 'Reddit archive journal identity mismatch');
  const dir = input.journalDirectory ?? await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let primaryFailed = false;
  try {
    const original = await dir.stat();
    const current = async () => { const s = await lstat(dirname(path));
      need(s.isDirectory() && s.dev === original.dev && s.ino === original.ino, 'Reddit archive directory changed; UNKNOWN'); };
    await current();
    const journal = { schemaVersion: 1, day: p.day, providerKey: 'reddit', coverage: p.coverage,
      semanticKey: p.semanticKey, planSha256, archiveSha256: p.archiveSha256, packetSha256: p.packetSha256,
      bindingConfigSha256: p.bindingConfigSha256, itemsSha256: p.itemsSha256,
      scope: { ...p.scope, correlationId: input.correlationId }, candidateIds: p.candidates.map(x => x.externalId) };
    await lifecycle.consumeStartedJournal(dir, name, journal);
    const result = await input.dependencies.withAtomicWrites(p, async writes => {
      await writes.assertMissing(lifecycle.scanJobId(p.semanticKey));
      const saved = await writes.persist();
      need(saved.inserted === p.candidates.length && saved.projected === p.candidates.length, 'Reddit archive write uncertain');
      const after = await writes.present();
      need(after === p.candidates.length, 'Reddit archive readback uncertain');
      return { coverage: p.coverage, planSha256, inserted: saved.inserted, alreadyPresent: 0, postWritePresent: after };
    });
    await current(); const anchored = `/proc/self/fd/${dir.fd}/${name}`, temporary = `${anchored}.${planSha256}.complete.tmp`;
    await writeExclusive(temporary, { ...journal, status: 'complete', ...result }); await dir.sync(); await current();
    await rename(temporary, anchored); await dir.sync(); await current(); return result;
  } catch (error) { primaryFailed = true; throw error; }
  finally { await closeOwnedDirectory(dir, input.journalDirectory === undefined, primaryFailed); }
}

async function closeOwnedDirectory(directory: FileHandle, owned: boolean, primaryFailed: boolean): Promise<void> {
  if (!owned) return;
  try { await directory.close(); } catch (error) { if (!primaryFailed) throw error; }
}
