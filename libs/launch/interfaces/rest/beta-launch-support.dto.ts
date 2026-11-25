import type {
  BetaKnownLimitation,
  BetaLaunchSupportSnapshot,
  PostMvpBacklogItem,
} from '../../domain';

export type BetaKnownLimitationDto = BetaKnownLimitation;

export type PostMvpBacklogItemDto = PostMvpBacklogItem;

export type BetaLaunchSupportResponseDto = BetaLaunchSupportSnapshot;

export type BetaKnownLimitationsResponseDto = {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly publishedAt: string;
  readonly launchMode: BetaLaunchSupportSnapshot['launchMode'];
  readonly knownLimitations: readonly BetaKnownLimitationDto[];
};

export type PostMvpBacklogResponseDto = {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly publishedAt: string;
  readonly postMvpBacklog: readonly PostMvpBacklogItemDto[];
};
