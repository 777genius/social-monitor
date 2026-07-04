import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PostRatingRecordTarget } from '../../domain';
import type { PostRatingReason } from '../../domain';

export type RecordPostRatingCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly rating: number;
  readonly reason?: PostRatingReason;
  readonly target: PostRatingRecordTarget;
};
