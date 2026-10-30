import type { CommandOutboxRecord, CommandOutboxStorePort } from '@social-monitor/platform-queue';

import type {
  ClaimDeliveryExecution,
  DeliveryAttemptDispatchStore,
  DeliveryAttemptExecutionStore,
  DeliveryAttemptScope,
  DeliveryDispatchCommand,
  DeliveryExecutionOutcome,
  DispatchDeliveryAttempt,
  OwnedDeliveryExecution,
} from '../../application/contracts/delivery-attempt-workflow';
import {
  deliveryDispatchCommand,
  isDeliveryExecutionOwned,
  prepareDeliveryClaim,
  prepareDeliveryDispatch,
  settleDeliveryExecution,
  type DeliveryWorkflowState,
} from '../../application/delivery-workflow-transitions';
import type { DeliveryAttempt } from '../../domain';

type PendingDispatch = {
  readonly command: DeliveryDispatchCommand;
  availableAt: Date;
  owner: string | null;
  expiresAt: Date | null;
  attempts: number;
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
};

export class InMemoryDeliveryWorkflowStore implements DeliveryAttemptDispatchStore, DeliveryAttemptExecutionStore, CommandOutboxStorePort {
  private readonly ownership = new Map<string, Omit<DeliveryWorkflowState, 'attempt'>>();
  private readonly outbox = new Map<string, PendingDispatch>();

  constructor(
    private readonly attemptsById: Map<string, DeliveryAttempt>,
    private readonly attemptsByIdempotencyKey: Map<string, DeliveryAttempt>,
  ) {}

  async dispatch(command: DispatchDeliveryAttempt) {
    const state = this.read(command);
    if (state === null) {
      return null;
    }
    const attempt = prepareDeliveryDispatch(state, command);
    if (attempt === null) {
      return { attempt: state.attempt, enqueued: false };
    }
    const enqueued = attempt.toSnapshot().state === 'assembling';
    if (enqueued && this.outbox.has(command.commandId)) {
      throw new Error('Delivery dispatch command identity already exists');
    }
    // No await separates these process-local mutations: state and intent appear
    // together, just as they do at the durable transaction commit boundary.
    this.write(attempt, {
      dispatchCommandId: enqueued ? command.commandId : state.dispatchCommandId,
      executionToken: null,
      executionLeaseExpiresAt: null,
    });
    if (enqueued) {
      this.outbox.set(command.commandId, {
        command: deliveryDispatchCommand(attempt, command),
        availableAt: command.now,
        owner: null,
        expiresAt: null,
        attempts: 0,
        status: 'PENDING',
      });
    }
    return { attempt, enqueued };
  }

  async claim(command: ClaimDeliveryExecution) {
    const state = this.read(command);
    if (state === null) {
      return null;
    }
    const attempt = prepareDeliveryClaim(state, command);
    if (attempt === null) {
      return { attempt: state.attempt, claimed: false };
    }
    const claimed = attempt.toSnapshot().state === 'assembling';
    this.write(attempt, {
      dispatchCommandId: state.dispatchCommandId ?? command.dispatchCommandId ?? null,
      executionToken: claimed ? command.token : null,
      executionLeaseExpiresAt: claimed ? command.expiresAt : null,
    });
    return { attempt, claimed };
  }

  async startSending(command: OwnedDeliveryExecution): Promise<DeliveryAttempt | null> {
    const state = this.read(command);
    if (state === null || !isDeliveryExecutionOwned(state, command.token, command.now)) {
      return null;
    }
    const attempt = state.attempt.markSending({ sendingAt: command.now });
    this.write(attempt, state);
    return attempt;
  }

  async renew(command: OwnedDeliveryExecution & { readonly expiresAt: Date }): Promise<boolean> {
    const state = this.read(command);
    if (state === null || !isDeliveryExecutionOwned(state, command.token, command.now)) {
      return false;
    }
    this.write(state.attempt, { ...state, executionLeaseExpiresAt: command.expiresAt });
    return true;
  }

  async settle(command: OwnedDeliveryExecution & { readonly outcome: DeliveryExecutionOutcome }): Promise<DeliveryAttempt | null> {
    const state = this.read(command);
    if (state === null || !isDeliveryExecutionOwned(state, command.token, command.now)) {
      return null;
    }
    const attempt = settleDeliveryExecution(state.attempt, command.outcome, command.now);
    this.write(attempt, {
      dispatchCommandId: state.dispatchCommandId,
      executionToken: null,
      executionLeaseExpiresAt: null,
    });
    return attempt;
  }

  async claimPending(params: Parameters<CommandOutboxStorePort['claimPending']>[0]): Promise<readonly CommandOutboxRecord[]> {
    const pending = [...this.outbox.values()]
      .filter((row) => row.status === 'PENDING' && row.availableAt <= params.now &&
        (row.expiresAt === null || row.expiresAt <= params.now))
      .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() ||
        left.command.commandId.localeCompare(right.command.commandId))
      .slice(0, Math.max(0, params.limit));
    return pending.map((row) => {
      row.owner = params.leaseOwner;
      row.expiresAt = params.leasedUntil;
      row.attempts += 1;
      return { id: row.command.commandId, command: row.command, publishAttempt: row.attempts };
    });
  }

  async markPublished(params: Parameters<CommandOutboxStorePort['markPublished']>[0]): Promise<void> {
    const row = this.ownedOutbox(params.id, params.leaseOwner);
    row.status = 'PUBLISHED';
    row.owner = null;
    row.expiresAt = null;
  }

  async markFailed(params: Parameters<CommandOutboxStorePort['markFailed']>[0]): Promise<void> {
    const row = this.ownedOutbox(params.id, params.leaseOwner);
    row.status = params.terminal ? 'FAILED' : 'PENDING';
    row.availableAt = params.availableAt;
    row.owner = null;
    row.expiresAt = null;
  }

  isRecoveryDue(attempt: DeliveryAttempt, now: Date, recoverBefore: Date): boolean {
    const snapshot = attempt.toSnapshot();
    if (snapshot.state !== 'assembling' && snapshot.state !== 'sending') {
      return false;
    }
    const state = this.read({ ...snapshot, deliveryAttemptId: snapshot.id });
    if (state?.executionLeaseExpiresAt != null) {
      return state.executionLeaseExpiresAt <= now;
    }
    const startedAt = snapshot.state === 'sending' ? snapshot.sendingAt : snapshot.assemblingAt;
    return startedAt !== undefined && startedAt <= recoverBefore;
  }

  private ownedOutbox(id: string, owner: string): PendingDispatch {
    const row = this.outbox.get(id);
    if (row === undefined || row.status !== 'PENDING' || row.owner !== owner) {
      throw new Error('Delivery command outbox ownership was lost');
    }
    return row;
  }

  private read(scope: DeliveryAttemptScope): DeliveryWorkflowState | null {
    const key = this.key(scope);
    const attempt = this.attemptsById.get(key);
    return attempt === undefined ? null : {
      attempt,
      ...(this.ownership.get(key) ?? {
        dispatchCommandId: null,
        executionToken: null,
        executionLeaseExpiresAt: null,
      }),
    };
  }

  private write(attempt: DeliveryAttempt, ownership: Omit<DeliveryWorkflowState, 'attempt'>): void {
    const snapshot = attempt.toSnapshot();
    const key = this.key({ ...snapshot, deliveryAttemptId: snapshot.id });
    this.attemptsById.set(key, attempt);
    this.attemptsByIdempotencyKey.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, attempt);
    this.ownership.set(key, {
      dispatchCommandId: ownership.dispatchCommandId,
      executionToken: ownership.executionToken,
      executionLeaseExpiresAt: ownership.executionLeaseExpiresAt,
    });
  }

  private key(scope: DeliveryAttemptScope): string {
    return `${scope.tenantId}:${scope.workspaceId}:${scope.deliveryAttemptId}`;
  }
}
