import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PostRatingRecord } from '../domain';

export const POST_RATING_REPOSITORY = Symbol('POST_RATING_REPOSITORY');

export interface PostRatingRepositoryPort {
  savePostRating(record: PostRatingRecord): Promise<void>;
  findPostRatingByIdempotencyKey(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: string;
  }): Promise<PostRatingRecord | null>;
}
