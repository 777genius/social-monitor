import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SourceBindingStatus } from '../entities/source-binding';

export type SourceBindingStatusChangedPayload = {
  readonly sourceBindingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly providerKey: string;
  readonly previousStatus: SourceBindingStatus;
  readonly status: SourceBindingStatus;
};

export type SourceBindingStatusChangedEvent = EventEnvelope<SourceBindingStatusChangedPayload>;
