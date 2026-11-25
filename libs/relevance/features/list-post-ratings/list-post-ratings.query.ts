import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PostRatingTarget } from '../../domain';

export type ListPostRatingsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly targets: readonly PostRatingTarget[];
};
