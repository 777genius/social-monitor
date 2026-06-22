import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { UserRelevanceProfile } from '../domain';

export const USER_RELEVANCE_PROFILE_REPOSITORY = Symbol('USER_RELEVANCE_PROFILE_REPOSITORY');

export interface UserRelevanceProfileRepositoryPort {
  save(profile: UserRelevanceProfile): Promise<void>;
  findByUser(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly userId: string;
  }): Promise<UserRelevanceProfile | null>;
}
