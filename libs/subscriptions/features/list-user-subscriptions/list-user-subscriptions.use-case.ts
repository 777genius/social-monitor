import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type {
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
  type UserSubscriptionDetailView,
} from '../shared/subscription-presenter';
import type { ListUserSubscriptionsQuery } from './list-user-subscriptions.query';
import type { ListUserSubscriptionsResult } from './list-user-subscriptions.result';

type ListUserSubscriptionsFailure = DomainError;

export class ListUserSubscriptionsUseCase {
  constructor(
    private readonly targets: SourceTargetRepositoryPort,
    private readonly subscriptions: UserSubscriptionRepositoryPort,
    private readonly schedules: UserSubscriptionScheduleRepositoryPort,
    private readonly preferences: UserSummaryPreferenceRepositoryPort,
  ) {}

  async execute(
    query: ListUserSubscriptionsQuery,
  ): Promise<Result<ListUserSubscriptionsResult, ListUserSubscriptionsFailure>> {
    if (query.userId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'User subscription list userId must be non-empty'));
    }

    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'User subscription list limit must be between 1 and 100'));
    }

    const page = await this.subscriptions.listByUser(query);
    const details: UserSubscriptionDetailView[] = [];

    for (const subscription of page.subscriptions) {
      const snapshot = subscription.toSnapshot();
      const [target, schedule, preference] = await Promise.all([
        this.targets.findById({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          sourceTargetId: snapshot.sourceTargetId,
        }),
        this.schedules.findBySubscription({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          subscriptionId: snapshot.id,
        }),
        this.preferences.findBySubscription({
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          userId: snapshot.userId,
          subscriptionId: snapshot.id,
        }),
      ]);

      if (target === null) {
        return err(new DomainError('resource.not_found', 'Source target for subscription was not found'));
      }

      details.push({
        sourceTarget: presentSourceTarget(target),
        subscription: presentUserSubscription(subscription),
        schedule: schedule === null ? undefined : presentUserSubscriptionSchedule(schedule),
        summaryPreference: preference === null ? undefined : presentUserSummaryPreference(preference),
      });
    }

    return ok({
      subscriptions: details,
      nextCursor: page.nextCursor,
    });
  }
}
