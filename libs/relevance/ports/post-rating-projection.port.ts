import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PostRating, PostRatingTarget } from '../domain';

export const POST_RATING_PROJECTION = Symbol('POST_RATING_PROJECTION');

export interface PostRatingProjectionPort {
  listLatestByTargets(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
    readonly targets: readonly PostRatingTarget[];
  }): Promise<readonly PostRating[]>;
}
