import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../../domain';
import type { DeliveryContent } from '../../ports/delivery-provider.port';

export type DeliveryAttemptScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
};

export type DeliveryWorkflowTiming = {
  readonly leaseMs: number;
  readonly dispatchRecoveryMs: number;
};

// The webhook transport has a 30-second maximum total request deadline. Keep
// ownership substantially longer, including preference/signing/database work.
export const deliveryWorkflowTiming: DeliveryWorkflowTiming = {
  leaseMs: 300_000,
  dispatchRecoveryMs: 300_000,
};

export type DispatchDeliveryAttempt = DeliveryAttemptScope & {
  readonly commandId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly now: Date;
  readonly recoverBefore: Date;
};

export type DispatchDeliveryResult = {
  readonly attempt: DeliveryAttempt;
  readonly enqueued: boolean;
} | null;

export interface DeliveryAttemptDispatchStore {
  /** Commit the assembling transition and its command together, or neither. */
  dispatch(command: DispatchDeliveryAttempt): Promise<DispatchDeliveryResult>;
}

export type ClaimDeliveryExecution = DeliveryAttemptScope & {
  readonly dispatchCommandId?: string;
  readonly token: string;
  readonly now: Date;
  readonly expiresAt: Date;
  readonly recoverBefore: Date;
};

export type DeliveryExecutionClaim = {
  readonly attempt: DeliveryAttempt;
  readonly claimed: boolean;
} | null;

export type OwnedDeliveryExecution = DeliveryAttemptScope & {
  readonly token: string;
  readonly now: Date;
};

export type DeliveryExecutionOutcome =
  | { readonly kind: 'delivered' }
  | { readonly kind: 'suppressed'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean };

export interface DeliveryAttemptExecutionStore {
  claim(command: ClaimDeliveryExecution): Promise<DeliveryExecutionClaim>;
  renew(command: OwnedDeliveryExecution & { readonly expiresAt: Date }): Promise<boolean>;
  startSending(command: OwnedDeliveryExecution): Promise<DeliveryAttempt | null>;
  settle(command: OwnedDeliveryExecution & {
    readonly outcome: DeliveryExecutionOutcome;
  }): Promise<DeliveryAttempt | null>;
}

export type DeliveryDispatchCommand = {
  readonly commandId: string;
  readonly commandType: 'delivery.attempt.send';
  readonly schemaVersion: 1;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: DeliveryAttemptScope & { readonly content: DeliveryContent };
};
