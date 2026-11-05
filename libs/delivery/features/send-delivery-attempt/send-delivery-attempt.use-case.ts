import {
  type Clock, type IdGenerator, DomainError, err, ok, redactSensitiveText, type Result,
} from '@social-monitor/shared-kernel';

import {
  deliveryWorkflowTiming,
  type DeliveryAttemptExecutionStore,
  type DeliveryExecutionOutcome,
  type DeliveryWorkflowTiming,
} from '../../application/contracts/delivery-attempt-workflow';
import type { DeliveryProviderPort, NotificationPreferenceReaderPort } from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import { withDeliveryExecutionHeartbeat } from './delivery-execution-heartbeat';
import type { SendDeliveryAttemptCommand } from './send-delivery-attempt.command';
import type { SendDeliveryAttemptResult } from './send-delivery-attempt.result';

type ProviderOutcome = { readonly outcome: DeliveryExecutionOutcome; readonly providerMessageId?: string };

export class SendDeliveryAttemptUseCase {
  constructor(
    private readonly execution: DeliveryAttemptExecutionStore,
    private readonly providers: readonly DeliveryProviderPort[],
    private readonly preferences: NotificationPreferenceReaderPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly timing: DeliveryWorkflowTiming = deliveryWorkflowTiming,
  ) {}

  async execute(command: SendDeliveryAttemptCommand): Promise<Result<SendDeliveryAttemptResult, DomainError | Error>> {
    if (command.deliveryAttemptId.trim().length === 0 || command.content.body.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Delivery attempt id and content body must be non-empty'));
    }
    const token = this.ids.generate();
    const now = this.clock.now();
    const claim = await this.execution.claim({
      ...command, token, now,
      expiresAt: new Date(now.getTime() + this.timing.leaseMs),
      recoverBefore: new Date(now.getTime() - this.timing.dispatchRecoveryMs),
    });
    if (claim === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', { deliveryAttemptId: command.deliveryAttemptId }));
    }
    // Duplicate and stale commands acknowledge the current durable state without
    // restarting an owner's provider call or replaying a completed effect.
    if (!claim.claimed) {
      return ok({ attempt: presentDeliveryAttempt(claim.attempt) });
    }
    const snapshot = claim.attempt.toSnapshot();
    let result: ProviderOutcome | null;
    try {
      const kept = await withDeliveryExecutionHeartbeat({
        store: this.execution, scope: command, token, clock: this.clock, leaseMs: this.timing.leaseMs,
        operation: async (signal): Promise<ProviderOutcome | null> => {
          const preference = await this.preferences.getDeliveryPreference({
            ...command, channel: snapshot.channel, recipientKey: snapshot.recipientKey,
            resourceType: snapshot.resourceType, resourceId: snapshot.resourceId,
          });
          if (!preference.allowed) {
            return { outcome: { kind: 'suppressed', reason: preference.reason } };
          }
          const provider = this.providers.find((candidate) => candidate.channel === snapshot.channel);
          if (provider === undefined) {
            return { outcome: { kind: 'failed', reason: 'Delivery provider is not configured', retryable: true } };
          }
          const sending = await this.execution.startSending({ ...command, token, now: this.clock.now() });
          if (sending === null) {
            return null;
          }
          const sent = await provider.send({ attempt: sending.toSnapshot(), content: command.content, signal });
          return sent.accepted
            ? { outcome: { kind: 'delivered' }, providerMessageId: sent.providerMessageId }
            : { outcome: { kind: 'failed', reason: safeReason(sent.reason), retryable: sent.retryable } };
        },
      });
      if (!kept.owned) {
        return err(new DomainError('operation.conflict', 'Delivery execution ownership was lost'));
      }
      result = kept.value;
    } catch (error) {
      if (error instanceof DomainError && error.code === 'operation.conflict') {
        return err(error);
      }
      result = { outcome: { kind: 'failed', retryable: true, reason: safeReason(error instanceof Error ? error.message : 'Delivery provider failed') } };
    }
    if (result === null) {
      return err(new DomainError('operation.conflict', 'Delivery execution ownership was lost before sending'));
    }
    // Keep persistence failures outside the provider catch. An uncertain durable
    // acknowledgement must not rewrite an accepted external effect as failure.
    const settled = await this.execution.settle({ ...command, token, now: this.clock.now(), outcome: result.outcome });
    if (settled === null) {
      return err(new DomainError('operation.conflict', 'Delivery execution ownership was lost before settlement'));
    }
    return ok({ attempt: presentDeliveryAttempt(settled), providerMessageId: result.providerMessageId });
  }
}

const safeReason = (reason: string): string => redactSensitiveText(reason).slice(0, 500) || 'Delivery provider failed';
