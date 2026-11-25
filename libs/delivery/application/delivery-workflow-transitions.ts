import type { DeliveryAttempt } from '../domain';
import type {
  ClaimDeliveryExecution,
  DeliveryDispatchCommand,
  DeliveryExecutionOutcome,
  DispatchDeliveryAttempt,
} from './contracts/delivery-attempt-workflow';

export type DeliveryWorkflowState = {
  readonly attempt: DeliveryAttempt;
  readonly dispatchCommandId: string | null;
  readonly executionToken: string | null;
  readonly executionLeaseExpiresAt: Date | null;
};

export const isDeliveryExecutionOwned = (
  state: DeliveryWorkflowState,
  token: string,
  now: Date,
): boolean => state.executionToken === token &&
  state.executionLeaseExpiresAt !== null && state.executionLeaseExpiresAt > now;

const isExpired = (state: DeliveryWorkflowState, recoverBefore: Date, now: Date): boolean => {
  if (state.executionLeaseExpiresAt !== null) {
    return state.executionLeaseExpiresAt <= now;
  }
  const snapshot = state.attempt.toSnapshot();
  const startedAt = snapshot.state === 'sending' ? snapshot.sendingAt : snapshot.assemblingAt;
  return startedAt !== undefined && startedAt <= recoverBefore;
};

const recover = (attempt: DeliveryAttempt, now: Date): DeliveryAttempt => {
  const failed = attempt.recoverInterrupted({
    failedAt: now,
    failureReason: 'Delivery ownership expired before a durable outcome was recorded',
  });
  return failed.toSnapshot().state === 'failed_terminal'
    ? failed.deadLetter({ deadLetteredAt: now, failureReason: failed.toSnapshot().failureReason ?? 'Delivery retry budget exhausted' })
    : failed;
};

export const prepareDeliveryDispatch = (
  state: DeliveryWorkflowState,
  command: DispatchDeliveryAttempt,
): DeliveryAttempt | null => {
  let attempt = state.attempt;
  let recovered = false;
  if (['assembling', 'sending'].includes(attempt.toSnapshot().state)) {
    if (!isExpired(state, command.recoverBefore, command.now)) {
      return null;
    }
    attempt = recover(attempt, command.now);
    recovered = true;
  }
  return ['queued', 'failed_retryable'].includes(attempt.toSnapshot().state)
    ? attempt.markAssembling({ assemblingAt: command.now })
    : recovered && attempt.toSnapshot().state === 'dead_lettered' ? attempt : null;
};

export const prepareDeliveryClaim = (
  state: DeliveryWorkflowState,
  command: ClaimDeliveryExecution,
): DeliveryAttempt | null => {
  const current = state.attempt.toSnapshot();
  if (state.dispatchCommandId !== null) {
    const explicitRetry = command.dispatchCommandId === undefined && current.state === 'failed_retryable';
    if (!explicitRetry && (state.dispatchCommandId !== command.dispatchCommandId || current.state === 'failed_retryable')) {
      return null;
    }
  }
  if (state.executionToken !== null && !isExpired(state, command.recoverBefore, command.now)) {
    return null;
  }
  let attempt = state.attempt;
  let recovered = false;
  const snapshot = attempt.toSnapshot();
  if (snapshot.state === 'sending' || (snapshot.state === 'assembling' && state.executionToken !== null)) {
    if (!isExpired(state, command.recoverBefore, command.now)) {
      return null;
    }
    attempt = recover(attempt, command.now);
    recovered = true;
  }
  if (['queued', 'failed_retryable'].includes(attempt.toSnapshot().state)) {
    return attempt.markAssembling({ assemblingAt: command.now });
  }
  return attempt.toSnapshot().state === 'assembling' || (recovered && attempt.toSnapshot().state === 'dead_lettered')
    ? attempt : null;
};

export const settleDeliveryExecution = (
  attempt: DeliveryAttempt,
  outcome: DeliveryExecutionOutcome,
  now: Date,
): DeliveryAttempt => {
  if (outcome.kind === 'delivered') {
    return attempt.markDelivered({ deliveredAt: now });
  }
  if (outcome.kind === 'suppressed') {
    return attempt.suppress({ suppressedAt: now, suppressionReason: outcome.reason });
  }
  const failure = attempt.toSnapshot().state === 'assembling'
    ? attempt.recoverInterrupted({ failedAt: now, failureReason: outcome.reason, retryable: outcome.retryable })
    : attempt.fail({ failedAt: now, failureReason: outcome.reason, retryable: outcome.retryable });
  return failure.toSnapshot().state === 'failed_terminal'
    ? failure.deadLetter({ deadLetteredAt: now, failureReason: outcome.reason }) : failure;
};

export const deliveryDispatchCommand = (
  attempt: DeliveryAttempt,
  command: DispatchDeliveryAttempt,
): DeliveryDispatchCommand => {
  const snapshot = attempt.toSnapshot();
  return {
    commandId: command.commandId,
    commandType: 'delivery.attempt.send',
    schemaVersion: 1,
    correlationId: command.correlationId,
    causationId: command.causationId,
    payload: {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      deliveryAttemptId: command.deliveryAttemptId,
      content: {
        subject: `${snapshot.resourceType} ready`,
        body: `Delivery resource ${snapshot.resourceType}:${snapshot.resourceId} is ready.`,
      },
    },
  };
};
