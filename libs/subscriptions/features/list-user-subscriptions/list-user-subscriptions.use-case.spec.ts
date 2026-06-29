import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  SourceTarget,
  UserSubscription,
  UserSubscriptionSchedule,
  UserSummaryPreference,
} from '../../domain';
import type {
  SourceTargetRepositoryPort,
  UserSubscriptionRepositoryPort,
  UserSubscriptionScheduleRepositoryPort,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import { ListUserSubscriptionsUseCase } from './list-user-subscriptions.use-case';

class FakeSourceTargets implements SourceTargetRepositoryPort {
  readonly targets = new Map<string, SourceTarget>();

  async save(target: SourceTarget): Promise<void> {
    const snapshot = target.toSnapshot();
    this.targets.set(snapshot.id, target);
  }

  async findById(params: Parameters<SourceTargetRepositoryPort['findById']>[0]): Promise<SourceTarget | null> {
    return this.targets.get(params.sourceTargetId) ?? null;
  }

  async findByNormalizedKey(): Promise<SourceTarget | null> {
    return null;
  }
}

class FakeUserSubscriptions implements UserSubscriptionRepositoryPort {
  readonly subscriptions: UserSubscription[] = [];

  async save(subscription: UserSubscription): Promise<void> {
    this.subscriptions.push(subscription);
  }

  async findById(): Promise<UserSubscription | null> {
    return null;
  }

  async findByUserAndTarget(): Promise<UserSubscription | null> {
    return null;
  }

  async listByUser(
    query: Parameters<UserSubscriptionRepositoryPort['listByUser']>[0],
  ): Promise<Awaited<ReturnType<UserSubscriptionRepositoryPort['listByUser']>>> {
    return {
      subscriptions: this.subscriptions.filter((subscription) => {
        const snapshot = subscription.toSnapshot();

        return snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.userId === query.userId;
      }).slice(0, query.limit),
      nextCursor: undefined,
    };
  }
}

class FakeUserSubscriptionSchedules implements UserSubscriptionScheduleRepositoryPort {
  readonly schedules = new Map<string, UserSubscriptionSchedule>();

  async save(schedule: UserSubscriptionSchedule): Promise<void> {
    const snapshot = schedule.toSnapshot();
    this.schedules.set(snapshot.subscriptionId, schedule);
  }

  async findBySubscription(
    params: Parameters<UserSubscriptionScheduleRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSubscriptionSchedule | null> {
    return this.schedules.get(params.subscriptionId) ?? null;
  }
}

class FakeUserSummaryPreferences implements UserSummaryPreferenceRepositoryPort {
  readonly preferences = new Map<string, UserSummaryPreference>();

  async save(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();
    this.preferences.set(snapshot.subscriptionId ?? snapshot.interestId ?? snapshot.id, preference);
  }

  async findBySubscription(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferences.get(params.subscriptionId) ?? null;
  }

  async findByInterest(): Promise<UserSummaryPreference | null> {
    return null;
  }

  async findEffective(): Promise<UserSummaryPreference | null> {
    return null;
  }
}

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const now = new Date('2026-06-21T10:00:00.000Z');

describe('ListUserSubscriptionsUseCase', () => {
  it('returns subscription details with schedule and summary preference', async () => {
    const targets = new FakeSourceTargets();
    const subscriptions = new FakeUserSubscriptions();
    const schedules = new FakeUserSubscriptionSchedules();
    const preferences = new FakeUserSummaryPreferences();
    const target = SourceTarget.create({
      id: 'target-1',
      tenantId: tenant,
      workspaceId: workspace,
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'TypeScript',
      normalizedKey: 'subreddit:typescript',
      config: {},
      createdAt: now,
      updatedAt: now,
    });
    const subscription = UserSubscription.create({
      id: 'subscription-1',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      sourceTargetId: 'target-1',
      createdAt: now,
      updatedAt: now,
    });

    await targets.save(target);
    await subscriptions.save(subscription);
    await schedules.save(UserSubscriptionSchedule.create({
      id: 'schedule-1',
      tenantId: tenant,
      workspaceId: workspace,
      subscriptionId: 'subscription-1',
      recipientKey: 'recipient-1',
      channel: 'in_app',
      intervalSeconds: 3600,
      includeNoSignal: true,
      nextRunAt: new Date('2026-06-21T11:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    }));
    await preferences.save(UserSummaryPreference.create({
      id: 'preference-1',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      language: 'ru',
      format: 'bullet_digest',
      tone: 'concise',
      createdAt: now,
      updatedAt: now,
    }));

    const result = await new ListUserSubscriptionsUseCase(
      targets,
      subscriptions,
      schedules,
      preferences,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      limit: 20,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.subscriptions).toEqual([
      expect.objectContaining({
        sourceTarget: expect.objectContaining({ id: 'target-1', providerKey: 'reddit' }),
        subscription: expect.objectContaining({ id: 'subscription-1', userId: 'user-1' }),
        schedule: expect.objectContaining({ id: 'schedule-1', includeNoSignal: true }),
        summaryPreference: expect.objectContaining({ id: 'preference-1', language: 'ru' }),
      }),
    ]);
  });

  it('returns a not found error when a subscription target is missing', async () => {
    const subscriptions = new FakeUserSubscriptions();
    await subscriptions.save(UserSubscription.create({
      id: 'subscription-1',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      sourceTargetId: 'missing-target',
      createdAt: now,
      updatedAt: now,
    }));

    const result = await new ListUserSubscriptionsUseCase(
      new FakeSourceTargets(),
      subscriptions,
      new FakeUserSubscriptionSchedules(),
      new FakeUserSummaryPreferences(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      limit: 20,
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.code).toBe('resource.not_found');
  });

  it('rejects invalid pagination limits', async () => {
    const result = await new ListUserSubscriptionsUseCase(
      new FakeSourceTargets(),
      new FakeUserSubscriptions(),
      new FakeUserSubscriptionSchedules(),
      new FakeUserSummaryPreferences(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      limit: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.code).toBe('validation.failed');
  });
});
