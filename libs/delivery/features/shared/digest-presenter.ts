import type { Digest, DigestProps } from '../../domain';

export type DigestView = Omit<DigestProps, 'window' | 'assembledAt'> & {
  readonly window: {
    readonly windowId: string;
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly assembledAt: string;
};

export const presentDigest = (digest: Digest): DigestView => {
  const snapshot = digest.toSnapshot();

  return {
    ...snapshot,
    window: {
      windowId: snapshot.window.windowId,
      startedAt: snapshot.window.startedAt.toISOString(),
      endedAt: snapshot.window.endedAt.toISOString(),
    },
    assembledAt: snapshot.assembledAt.toISOString(),
  };
};
