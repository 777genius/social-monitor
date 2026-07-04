import type { SocialSearchLane } from '../../domain/value-objects/social-search-plan';

export const maxItemsForLane = (lane: SocialSearchLane): number =>
  Math.max(1, Math.min(100, lane.maxItems));

export const totalMaxItems = (lanes: readonly SocialSearchLane[]): number =>
  Math.max(
    1,
    Math.min(
      100,
      lanes.reduce((total, lane) => total + maxItemsForLane(lane), 0),
    ),
  );
