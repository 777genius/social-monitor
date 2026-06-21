import {
  type Clock,
  DomainError,
  type IdGenerator,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  SourceTarget,
  UserSubscription,
  UserSubscriptionSchedule,
  UserSummaryPreference,
} from '../../domain';
import type {
  SourceTargetCatalogPort,
  SourceTargetRepositoryPort,
  UserSubscriptionRepositoryPort,
  UserSubscriptionScheduleRepositoryPort,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import {
  presentSourceTarget,
  presentUserSubscription,
  presentUserSubscriptionSchedule,
  presentUserSummaryPreference,
} from '../shared/subscription-presenter';
import type { CreateUserSubscriptionCommand } from './create-user-subscription.command';
import type { CreateUserSubscriptionResult } from './create-user-subscription.result';

type CreateUserSubscriptionFailure = DomainError | Error;

export class CreateUserSubscriptionUseCase {
  constructor(
    private readonly targets: SourceTargetRepositoryPort,
    private readonly subscriptions: UserSubscriptionRepositoryPort,
    private readonly schedules: UserSubscriptionScheduleRepositoryPort,
    private readonly summaryPreferences: UserSummaryPreferenceRepositoryPort,
    private readonly targetCatalog: SourceTargetCatalogPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateUserSubscriptionCommand,
  ): Promise<Result<CreateUserSubscriptionResult, CreateUserSubscriptionFailure>> {
    if (command.userId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'User subscription userId must be non-empty'));
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

    try {
      const now = this.clock.now();
      let target = await this.targets.findByNormalizedKey({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        providerKey: validation.descriptor.providerKey,
        normalizedKey: validation.descriptor.normalizedKey,
      });

      if (target === null) {
        target = SourceTarget.create({
          id: this.ids.generate(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          providerKey: validation.descriptor.providerKey,
          targetKind: validation.descriptor.targetKind,
          targetValue: validation.descriptor.targetValue,
          normalizedKey: validation.descriptor.normalizedKey,
          config: validation.descriptor.config,
          createdAt: now,
          updatedAt: now,
        });
        await this.targets.save(target);
      }

      const targetSnapshot = target.toSnapshot();
      const existing = await this.subscriptions.findByUserAndTarget({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId: command.userId,
        sourceTargetId: targetSnapshot.id,
      });

      const subscription = existing ?? UserSubscription.create({
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        userId: command.userId,
        sourceTargetId: targetSnapshot.id,
        createdAt: now,
        updatedAt: now,
      });

      if (existing === null) {
        await this.subscriptions.save(subscription);
      }

      const subscriptionSnapshot = subscription.toSnapshot();
      const existingSchedule = await this.schedules.findBySubscription({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        subscriptionId: subscriptionSnapshot.id,
      });
      const schedule = UserSubscriptionSchedule.create({
        id: existingSchedule?.toSnapshot().id ?? this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        subscriptionId: subscriptionSnapshot.id,
        recipientKey: command.schedule.recipientKey,
        channel: command.schedule.channel,
        intervalSeconds: command.schedule.intervalSeconds,
        includeNoSignal: command.schedule.includeNoSignal,
        nextRunAt: command.schedule.nextRunAt ?? new Date(now.getTime() + command.schedule.intervalSeconds * 1000),
        createdAt: existingSchedule?.toSnapshot().createdAt ?? now,
        updatedAt: now,
      });
      await this.schedules.save(schedule);

      const existingPreference = command.summaryPreference === undefined
        ? null
        : await this.summaryPreferences.findBySubscription({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            userId: command.userId,
            subscriptionId: subscriptionSnapshot.id,
          });
      const preference = command.summaryPreference === undefined
        ? undefined
        : existingPreference === null
          ? UserSummaryPreference.create({
              id: this.ids.generate(),
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              userId: command.userId,
              subscriptionId: subscriptionSnapshot.id,
              ...command.summaryPreference,
              createdAt: now,
              updatedAt: now,
            })
          : existingPreference.update({
              ...command.summaryPreference,
              updatedAt: now,
            });

      if (preference !== undefined) {
        await this.summaryPreferences.save(preference);
      }

      return ok({
        sourceTarget: presentSourceTarget(target),
        subscription: presentUserSubscription(subscription),
        schedule: presentUserSubscriptionSchedule(schedule),
        summaryPreference: preference === undefined ? undefined : presentUserSummaryPreference(preference),
        created: existing === null,
      });
    } catch (error) {
      return err(error instanceof Error ? new DomainError('validation.failed', error.message) : new Error('Subscription creation failed'));
    }
  }
}
