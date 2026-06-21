import type { UserSubscriptionSchedule } from '../../domain';
import type { UserSubscriptionScheduleRepositoryPort } from '../../ports';

export class InMemoryUserSubscriptionScheduleRepository implements UserSubscriptionScheduleRepositoryPort {
  private readonly schedulesBySubscription = new Map<string, UserSubscriptionSchedule>();

  async save(schedule: UserSubscriptionSchedule): Promise<void> {
    const snapshot = schedule.toSnapshot();
    this.schedulesBySubscription.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.subscriptionId}`,
      schedule,
    );
  }

  async findBySubscription(
    params: Parameters<UserSubscriptionScheduleRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSubscriptionSchedule | null> {
    return this.schedulesBySubscription.get(
      `${params.tenantId}:${params.workspaceId}:${params.subscriptionId}`,
    ) ?? null;
  }
}
