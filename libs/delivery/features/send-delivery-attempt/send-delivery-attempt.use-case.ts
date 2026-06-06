import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  DeliveryProviderPort,
  NotificationPreferenceReaderPort,
} from '../../ports';
import { presentDeliveryAttempt } from '../shared/delivery-attempt-presenter';
import type { SendDeliveryAttemptCommand } from './send-delivery-attempt.command';
import type { SendDeliveryAttemptResult } from './send-delivery-attempt.result';

type SendDeliveryAttemptFailure = DomainError | Error;

export class SendDeliveryAttemptUseCase {
  constructor(
    private readonly deliveryAttempts: DeliveryAttemptRepositoryPort,
    private readonly providers: readonly DeliveryProviderPort[],
    private readonly preferences: NotificationPreferenceReaderPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: SendDeliveryAttemptCommand,
  ): Promise<Result<SendDeliveryAttemptResult, SendDeliveryAttemptFailure>> {
    const validation = validate(command);

    if (validation !== null) {
      return err(validation);
    }

    const queuedAttempt = await this.deliveryAttempts.findById(command);

    if (queuedAttempt === null) {
      return err(new DomainError('resource.not_found', 'Delivery attempt not found', {
        deliveryAttemptId: command.deliveryAttemptId,
      }));
    }

    const queuedSnapshot = queuedAttempt.toSnapshot();
    const preference = await this.preferences.getDeliveryPreference({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      channel: queuedSnapshot.channel,
      recipientKey: queuedSnapshot.recipientKey,
      resourceType: queuedSnapshot.resourceType,
      resourceId: queuedSnapshot.resourceId,
    });

    if (!preference.allowed) {
      const suppressedAttempt = queuedAttempt.suppress({
        suppressedAt: this.clock.now(),
        suppressionReason: preference.reason,
      });
      await this.deliveryAttempts.save(suppressedAttempt);

      return ok({
        attempt: presentDeliveryAttempt(suppressedAttempt),
      });
    }

    const provider = this.providers.find((candidate) => candidate.channel === queuedSnapshot.channel);

    if (provider === undefined) {
      return err(new DomainError('external.dependency_unavailable', 'Delivery provider is not configured', {
        channel: queuedSnapshot.channel,
      }));
    }

    const sendingAttempt = queuedAttempt.markSending({ sendingAt: this.clock.now() });
    await this.deliveryAttempts.save(sendingAttempt);

    const providerResult = await provider.send({
      attempt: sendingAttempt.toSnapshot(),
      content: command.content,
    });

    if (providerResult.accepted) {
      const deliveredAttempt = sendingAttempt.markDelivered({ deliveredAt: this.clock.now() });
      await this.deliveryAttempts.save(deliveredAttempt);

      return ok({
        attempt: presentDeliveryAttempt(deliveredAttempt),
        providerMessageId: providerResult.providerMessageId,
      });
    }

    const failedAttempt = sendingAttempt.fail({
      failedAt: this.clock.now(),
      failureReason: providerResult.reason,
      retryable: providerResult.retryable,
    });
    const finalAttempt = shouldDeadLetter(failedAttempt, providerResult.retryable)
      ? failedAttempt.deadLetter({
          deadLetteredAt: this.clock.now(),
          failureReason: providerResult.reason,
        })
      : failedAttempt;

    await this.deliveryAttempts.save(finalAttempt);

    return ok({
      attempt: presentDeliveryAttempt(finalAttempt),
    });
  }
}

const validate = (command: SendDeliveryAttemptCommand): DomainError | null => {
  if (command.deliveryAttemptId.trim().length === 0) {
    return new DomainError('validation.failed', 'Delivery attempt id must be non-empty');
  }

  if (command.content.body.trim().length === 0) {
    return new DomainError('validation.failed', 'Delivery content body must be non-empty');
  }

  return null;
};

const shouldDeadLetter = (attempt: DeliveryAttempt, providerRetryable: boolean): boolean => {
  const snapshot = attempt.toSnapshot();

  return snapshot.state === 'failed_terminal' || !providerRetryable;
};
