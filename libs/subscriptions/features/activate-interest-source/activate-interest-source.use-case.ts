import {
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import type {
  InterestSourceProvisionerPort,
  SourceTargetCatalogPort,
} from '../../ports';
import type { CreateUserSubscriptionUseCase } from '../create-user-subscription/create-user-subscription.use-case';
import type { ActivateInterestSourceCommand } from './activate-interest-source.command';
import type { ActivateInterestSourceResult } from './activate-interest-source.result';

type ActivateInterestSourceFailure = DomainError | Error;

type CreateUserSubscriptionWorkflow = Pick<CreateUserSubscriptionUseCase, 'execute'>;

export class ActivateInterestSourceUseCase {
  constructor(
    private readonly createUserSubscription: CreateUserSubscriptionWorkflow,
    private readonly interestSources: InterestSourceProvisionerPort,
    private readonly targetCatalog: SourceTargetCatalogPort,
  ) {}

  async execute(
    command: ActivateInterestSourceCommand,
  ): Promise<Result<ActivateInterestSourceResult, ActivateInterestSourceFailure>> {
    if (command.idempotencyKey.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Activation idempotency key must be non-empty'));
    }

    const validation = this.targetCatalog.validateTarget({
      providerKey: command.providerKey,
      targetKind: command.targetKind,
      targetValue: command.targetValue,
      config: command.targetConfig,
    });
    if (!validation.ok) {
      return err(new DomainError('validation.failed', validation.reason));
    }

    const provisioned = await this.interestSources.provision({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      descriptor: validation.descriptor,
      scanPolicy: command.scanPolicy,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    if (!provisioned.ok) {
      return err(provisioned.error);
    }

    const subscriptionResult = await this.createUserSubscription.execute({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      userId: command.userId,
      providerKey: command.providerKey,
      targetKind: command.targetKind,
      targetValue: command.targetValue,
      targetConfig: command.targetConfig,
      schedule: command.schedule,
      summaryPreference: command.summaryPreference,
    });
    if (!subscriptionResult.ok) {
      return err(subscriptionResult.error);
    }

    return ok({
      ...subscriptionResult.value,
      ...provisioned.value,
    });
  }
}
