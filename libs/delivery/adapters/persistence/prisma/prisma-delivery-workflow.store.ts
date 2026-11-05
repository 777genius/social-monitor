import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  ClaimDeliveryExecution,
  DeliveryAttemptDispatchStore,
  DeliveryAttemptExecutionStore,
  DeliveryAttemptScope,
  DeliveryExecutionOutcome,
  DispatchDeliveryAttempt,
  OwnedDeliveryExecution,
} from '../../../application/contracts/delivery-attempt-workflow';
import {
  deliveryDispatchCommand,
  isDeliveryExecutionOwned,
  prepareDeliveryClaim,
  prepareDeliveryDispatch,
  settleDeliveryExecution,
  type DeliveryWorkflowState,
} from '../../../application/delivery-workflow-transitions';
import type { DeliveryAttempt } from '../../../domain';
import { deliveryAttemptFromPrisma, deliveryAttemptStateToPrisma } from './prisma-delivery-records';
import type {
  PrismaDeliveryWorkflowClient,
  PrismaDeliveryWorkflowRecord,
  PrismaDeliveryWorkflowTransaction,
  PrismaDeliveryWorkflowUpdate,
} from './prisma-delivery-workflow-client';

export class PrismaDeliveryWorkflowStore implements DeliveryAttemptDispatchStore, DeliveryAttemptExecutionStore {
  constructor(private readonly prisma: PrismaDeliveryWorkflowClient) {}

  async dispatch(command: DispatchDeliveryAttempt) {
    return this.transaction(async (tx) => {
      const record = await tx.deliveryAttempt.findFirst({ where: scopedWhere(command) });
      if (record === null) {
        return null;
      }
      const state = workflowState(record);
      const attempt = prepareDeliveryDispatch(state, command);
      if (attempt === null) {
        return { attempt: state.attempt, enqueued: false };
      }
      const enqueued = attempt.toSnapshot().state === 'assembling';
      const changed = await replaceState(tx, record, attempt, {
        dispatchCommandId: enqueued ? command.commandId : state.dispatchCommandId,
        executionToken: null,
        executionLeaseExpiresAt: null,
      });
      if (!changed) {
        return { attempt: state.attempt, enqueued: false };
      }
      if (enqueued) {
        const envelope = deliveryDispatchCommand(attempt, command);
        await tx.outboxEvent.create({ data: {
          id: envelope.commandId,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          messageKind: 'COMMAND',
          eventType: envelope.commandType,
          schemaVersion: envelope.schemaVersion,
          payload: envelope.payload,
          correlationId: envelope.correlationId,
          causationId: envelope.causationId ?? null,
          availableAt: command.now,
        } });
      }
      return { attempt, enqueued };
    });
  }

  async claim(command: ClaimDeliveryExecution) {
    return this.transaction(async (tx) => {
      const record = await tx.deliveryAttempt.findFirst({ where: scopedWhere(command) });
      if (record === null) {
        return null;
      }
      const state = workflowState(record);
      const attempt = prepareDeliveryClaim(state, command);
      if (attempt === null) {
        return { attempt: state.attempt, claimed: false };
      }
      const claimed = attempt.toSnapshot().state === 'assembling';
      const changed = await replaceState(tx, record, attempt, {
        dispatchCommandId: state.dispatchCommandId ?? command.dispatchCommandId ?? null,
        executionToken: claimed ? command.token : null,
        executionLeaseExpiresAt: claimed ? command.expiresAt : null,
      });
      return { attempt: changed ? attempt : state.attempt, claimed: changed && claimed };
    });
  }

  async startSending(command: OwnedDeliveryExecution): Promise<DeliveryAttempt | null> {
    return this.transitionOwned(command, (attempt) => attempt.markSending({ sendingAt: command.now }), false);
  }

  async renew(command: OwnedDeliveryExecution & { readonly expiresAt: Date }): Promise<boolean> {
    return this.transaction(async (tx) => {
      const record = await tx.deliveryAttempt.findFirst({ where: scopedWhere(command) });
      if (record === null || !isDeliveryExecutionOwned(workflowState(record), command.token, command.now)) {
        return false;
      }
      const updated = await tx.deliveryAttempt.updateMany({
        where: { ...scopedWhere(command), executionToken: command.token, executionLeaseExpiresAt: { gt: command.now } },
        data: updateData(deliveryAttemptFromPrisma(record), {
          ...workflowState(record), executionLeaseExpiresAt: command.expiresAt,
        }),
      });
      return updated.count === 1;
    });
  }

  async settle(command: OwnedDeliveryExecution & { readonly outcome: DeliveryExecutionOutcome }): Promise<DeliveryAttempt | null> {
    return this.transitionOwned(command, (attempt) => settleDeliveryExecution(attempt, command.outcome, command.now), true);
  }

  private transitionOwned(
    command: OwnedDeliveryExecution,
    transition: (attempt: DeliveryAttempt) => DeliveryAttempt,
    release: boolean,
  ): Promise<DeliveryAttempt | null> {
    return this.transaction(async (tx) => {
      const record = await tx.deliveryAttempt.findFirst({ where: scopedWhere(command) });
      if (record === null) {
        return null;
      }
      const state = workflowState(record);
      if (!isDeliveryExecutionOwned(state, command.token, command.now)) {
        return null;
      }
      const attempt = transition(state.attempt);
      const updated = await tx.deliveryAttempt.updateMany({
        where: { ...scopedWhere(command), state: record.state, executionToken: command.token,
          executionLeaseExpiresAt: { gt: command.now } },
        data: updateData(attempt, release ? {
          dispatchCommandId: state.dispatchCommandId, executionToken: null, executionLeaseExpiresAt: null,
        } : state),
      });
      return updated.count === 1 ? attempt : null;
    });
  }

  private transaction<T>(work: (tx: PrismaDeliveryWorkflowTransaction) => Promise<T>): Promise<T> {
    return withPrismaWriteRetry(() => this.prisma.$transaction(work, { isolationLevel: 'Serializable' }));
  }
}

const scopedWhere = (scope: DeliveryAttemptScope) => ({
  id: scope.deliveryAttemptId, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
});

const workflowState = (record: PrismaDeliveryWorkflowRecord): DeliveryWorkflowState => ({
  attempt: deliveryAttemptFromPrisma(record),
  dispatchCommandId: record.dispatchCommandId,
  executionToken: record.executionToken,
  executionLeaseExpiresAt: record.executionLeaseExpiresAt,
});

const replaceState = async (
  tx: PrismaDeliveryWorkflowTransaction,
  record: PrismaDeliveryWorkflowRecord,
  attempt: DeliveryAttempt,
  ownership: Omit<DeliveryWorkflowState, 'attempt'>,
): Promise<boolean> => {
  const updated = await tx.deliveryAttempt.updateMany({
    where: { id: record.id, tenantId: record.tenantId, workspaceId: record.workspaceId,
      state: record.state, retryCount: record.retryCount,
      dispatchCommandId: record.dispatchCommandId, executionToken: record.executionToken },
    data: updateData(attempt, ownership),
  });
  return updated.count === 1;
};

const updateData = (attempt: DeliveryAttempt, ownership: Omit<DeliveryWorkflowState, 'attempt'>): PrismaDeliveryWorkflowUpdate => {
  const snapshot = attempt.toSnapshot();
  return {
    state: deliveryAttemptStateToPrisma(snapshot.state),
    assemblingAt: snapshot.assemblingAt ?? null,
    suppressedAt: snapshot.suppressedAt ?? null,
    sendingAt: snapshot.sendingAt ?? null,
    deliveredAt: snapshot.deliveredAt ?? null,
    failedAt: snapshot.failedAt ?? null,
    deadLetteredAt: snapshot.deadLetteredAt ?? null,
    retryCount: snapshot.retryCount,
    failureReason: snapshot.failureReason ?? null,
    suppressionReason: snapshot.suppressionReason ?? null,
    dispatchCommandId: ownership.dispatchCommandId,
    executionToken: ownership.executionToken,
    executionLeaseExpiresAt: ownership.executionLeaseExpiresAt,
  };
};
