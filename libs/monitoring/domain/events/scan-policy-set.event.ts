import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScanPolicySetPayload = {
  readonly scanPolicyId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
};

export type ScanPolicySetEvent = EventEnvelope<ScanPolicySetPayload>;
