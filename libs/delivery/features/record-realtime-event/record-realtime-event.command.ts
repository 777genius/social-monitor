import type { CorrelationId, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { RealtimeResourceType } from '../../domain';

export type RecordRealtimeEventCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly channel: string;
  readonly eventType: string;
  readonly resourceType: RealtimeResourceType;
  readonly resourceId: string;
  readonly correlationId: CorrelationId;
  readonly payload: Readonly<Record<string, unknown>>;
};
