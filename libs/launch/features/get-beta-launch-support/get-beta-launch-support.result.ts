import type {
  BetaKnownLimitation,
  BetaLaunchMode,
  PostMvpBacklogItem,
} from '../../domain';

export type GetBetaLaunchSupportResult = {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly publishedAt: string;
  readonly launchMode: BetaLaunchMode;
  readonly supportedSources: readonly string[];
  readonly deferredSources: readonly string[];
  readonly knownLimitations: readonly BetaKnownLimitation[];
  readonly postMvpBacklog: readonly PostMvpBacklogItem[];
};
