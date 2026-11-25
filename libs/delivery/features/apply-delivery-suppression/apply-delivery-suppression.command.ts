import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DeliverySuppressionPolicyInput = {
  readonly allowNoSignal: boolean;
  readonly highSignalOnly: boolean;
  readonly repeatedFailureSuppressed: boolean;
};

export type ApplyDeliverySuppressionCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
  readonly resourceSignal: 'high' | 'normal' | 'low' | 'no_signal';
  readonly policy: DeliverySuppressionPolicyInput;
};
