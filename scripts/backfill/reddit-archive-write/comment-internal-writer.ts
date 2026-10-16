import { constants } from 'node:fs';
import { lstat, open, rename, type FileHandle } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { writeExclusive } from '../../lib/github-archive-finite-journal';
import { archiveNeed as need, redditArchiveHash as hash } from '../../lib/reddit-archive-finite-policy';
import type { RedditArchiveCommentPlan } from './comment-plan';

export type RedditArchiveCommentWrites = Readonly<{
  assertParentAndMissing: () => Promise<void>;
  persist: () => Promise<Readonly<{ inserted: number; projected: number }>>;
  present: () => Promise<number>;
}>;

export type RedditArchiveCommentAtomicDependencies = Readonly<{
  withAtomicWrites: <T>(
    plan: RedditArchiveCommentPlan,
    work: (writes: RedditArchiveCommentWrites) => Promise<T>,
  ) => Promise<T>;
}>;

export type RedditArchiveCommentLifecycle = Readonly<{
  consumeStartedJournal: (
    directory: FileHandle,
    name: string,
    journal: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}>;

export const executeInternalRedditArchiveCommentWrite = async (input: {
  readonly plan: RedditArchiveCommentPlan;
  readonly expectedPlanSha256: string;
  readonly semanticKey: string;
  readonly correlationId: string;
  readonly journalPath: string;
  readonly journalDirectory?: FileHandle;
  readonly dependencies: RedditArchiveCommentAtomicDependencies;
}, lifecycle: RedditArchiveCommentLifecycle) => {
  const plan = structuredClone(input.plan);
  const { planSha256, ...unsigned } = plan;
  need(
    planSha256 === input.expectedPlanSha256 &&
      hash(JSON.stringify(unsigned)) === planSha256 &&
      plan.semanticKey === input.semanticKey &&
      plan.providerKey === 'reddit' &&
      plan.candidates.length === 2 &&
      plan.candidates.every((unit) =>
        unit.providerUnitId.startsWith('t1_') &&
        unit.rootProviderItemId === 't3_1wuktlf',
      ) &&
      new Set(plan.candidates.map((unit) => unit.providerUnitId)).size === 2 &&
      hash(JSON.stringify(plan.candidates)) === plan.commentsSha256,
    'Reddit archive comment plan mismatch',
  );
  need(
    /^[a-zA-Z0-9._:-]{1,128}$/u.test(input.correlationId),
    'Reddit archive comment correlation invalid',
  );

  const path = resolve(input.journalPath);
  const name = `reddit-archive-comments-qualified-${plan.semanticKey}.journal.json`;
  need(
    basename(path) === name,
    'Reddit archive comment journal identity mismatch',
  );
  const directory =
    input.journalDirectory ??
    (await open(
      dirname(path),
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    ));
  let primaryFailed = false;
  try {
    const original = await directory.stat();
    const current = async () => {
      const stat = await lstat(dirname(path));
      need(
        stat.isDirectory() &&
          stat.dev === original.dev &&
          stat.ino === original.ino,
        'Reddit archive comment directory changed; UNKNOWN',
      );
    };
    await current();
    const journal = {
      schemaVersion: 1,
      kind: 'reddit-archive-comments',
      providerKey: 'reddit',
      coverage: plan.coverage,
      semanticKey: plan.semanticKey,
      planSha256,
      packetSha256: plan.packetSha256,
      rawSha256: plan.rawSha256,
      commentsSha256: plan.commentsSha256,
      bindingConfigSha256: plan.bindingConfigSha256,
      sourceUrl: plan.sourceUrl,
      acquiredAt: plan.acquiredAt,
      identity: plan.identity,
      originalDays: plan.originalDays,
      scope: { ...plan.scope, correlationId: input.correlationId },
      candidateIds: plan.candidates.map((unit) => unit.providerUnitId),
    };
    await lifecycle.consumeStartedJournal(directory, name, journal);

    const result = await input.dependencies.withAtomicWrites(
      plan,
      async (writes) => {
        await writes.assertParentAndMissing();
        const saved = await writes.persist();
        need(
          saved.inserted === 2 &&
            saved.projected === 2,
          'Reddit archive comment write uncertain',
        );
        const after = await writes.present();
        need(after === 2, 'Reddit archive comment readback uncertain');
        return {
          coverage: plan.coverage,
          planSha256,
          inserted: saved.inserted,
          alreadyPresent: 0,
          postWritePresent: after,
        };
      },
    );
    await current();
    const anchored = `/proc/self/fd/${directory.fd}/${name}`;
    const temporary = `${anchored}.${planSha256}.complete.tmp`;
    await writeExclusive(temporary, {
      ...journal,
      status: 'complete',
      ...result,
    });
    await directory.sync();
    await current();
    await rename(temporary, anchored);
    await directory.sync();
    await current();
    return result;
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    if (input.journalDirectory === undefined) {
      try {
        await directory.close();
      } catch (error) {
        if (!primaryFailed) throw error;
      }
    }
  }
};
