import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanRequestedPayload = {
  readonly scanJobId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
};

export type ScanRequestedEvent = EventEnvelope<ScanRequestedPayload>;
