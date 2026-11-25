import type { UserSummaryPreference } from '../../domain';
import type { UserSummaryPreferenceRepositoryPort } from '../../ports';

export class InMemoryUserSummaryPreferenceRepository implements UserSummaryPreferenceRepositoryPort {
  private readonly preferencesBySubscription = new Map<string, UserSummaryPreference>();
  private readonly preferencesByInterest = new Map<string, UserSummaryPreference>();

  async save(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();

    if (snapshot.subscriptionId !== undefined) {
      this.preferencesBySubscription.set(
        `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}:${snapshot.subscriptionId}`,
        preference,
      );
    }

    if (snapshot.interestId !== undefined) {
      this.preferencesByInterest.set(
        `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}:${snapshot.interestId}`,
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

  async findByInterest(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findByInterest']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferencesByInterest.get(
      `${params.tenantId}:${params.workspaceId}:${params.userId}:${params.interestId}`,
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

    return this.findByInterest({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      interestId: params.interestId,
    });
  }
}
