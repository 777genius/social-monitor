import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RelevanceFeedbackAction, RelevanceFeedbackTarget } from '../../domain';

export type RecordRelevanceFeedbackCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: RelevanceFeedbackAction;
  readonly rating?: number;
  readonly target: RelevanceFeedbackTarget;
};
