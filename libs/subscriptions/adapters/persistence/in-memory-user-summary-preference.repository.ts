import type { UserSummaryPreference } from '../../domain';
import type { UserSummaryPreferenceRepositoryPort } from '../../ports';

export class InMemoryUserSummaryPreferenceRepository implements UserSummaryPreferenceRepositoryPort {
  private readonly preferencesBySubscription = new Map<string, UserSummaryPreference>();
  private readonly preferencesByTopic = new Map<string, UserSummaryPreference>();

  async save(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();

    if (snapshot.subscriptionId !== undefined) {
      this.preferencesBySubscription.set(
        `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}:${snapshot.subscriptionId}`,
        preference,
      );
    }

    if (snapshot.topicId !== undefined) {
      this.preferencesByTopic.set(
        `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}:${snapshot.topicId}`,
        preference,
      );
    }
  }

  async findBySubscription(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferencesBySubscription.get(
      `${params.tenantId}:${params.workspaceId}:${params.userId}:${params.subscriptionId}`,
    ) ?? null;
  }

  async findByTopic(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findByTopic']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferencesByTopic.get(
      `${params.tenantId}:${params.workspaceId}:${params.userId}:${params.topicId}`,
    ) ?? null;
  }

  async findEffective(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findEffective']>[0],
  ): Promise<UserSummaryPreference | null> {
    if (params.subscriptionId !== undefined) {
      const subscriptionPreference = await this.findBySubscription({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        subscriptionId: params.subscriptionId,
      });

      if (subscriptionPreference !== null) {
        return subscriptionPreference;
      }
    }

    return this.findByTopic({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      topicId: params.topicId,
    });
  }
}
