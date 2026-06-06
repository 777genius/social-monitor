import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryChannel } from '../../domain';

export type AssembleDigestCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly topicIds: readonly string[];
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly includeNoSignal: boolean;
  readonly maxRetries?: number;
};
