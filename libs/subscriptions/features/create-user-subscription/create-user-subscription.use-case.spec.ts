import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  SourceTarget,
  SourceTargetKind,
  UserSubscription,
  UserSubscriptionSchedule,
  UserSummaryPreference,
} from '../../domain';
import type {
  SourceTargetCatalogPort,
  SourceTargetRepositoryPort,
  SourceTargetValidationResult,
  UserSubscriptionRepositoryPort,
  UserSubscriptionScheduleRepositoryPort,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import { CreateUserSubscriptionUseCase } from './create-user-subscription.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `subscription-id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeSourceTargets implements SourceTargetRepositoryPort {
  readonly targets = new Map<string, SourceTarget>();

  async save(target: SourceTarget): Promise<void> {
    const snapshot = target.toSnapshot();
    this.targets.set(snapshot.id, target);
  }

  async findById(params: Parameters<SourceTargetRepositoryPort['findById']>[0]): Promise<SourceTarget | null> {
    return this.targets.get(params.sourceTargetId) ?? null;
  }

  async findByNormalizedKey(
    query: Parameters<SourceTargetRepositoryPort['findByNormalizedKey']>[0],
  ): Promise<SourceTarget | null> {
    return [...this.targets.values()].find((target) => {
      const snapshot = target.toSnapshot();

      return snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        snapshot.providerKey === query.providerKey &&
        snapshot.normalizedKey === query.normalizedKey;
    }) ?? null;
  }
}

class FakeUserSubscriptions implements UserSubscriptionRepositoryPort {
  readonly subscriptions = new Map<string, UserSubscription>();

  async save(subscription: UserSubscription): Promise<void> {
    const snapshot = subscription.toSnapshot();
    this.subscriptions.set(snapshot.id, subscription);
  }

  async findById(params: Parameters<UserSubscriptionRepositoryPort['findById']>[0]): Promise<UserSubscription | null> {
    return this.subscriptions.get(params.subscriptionId) ?? null;
  }

  async findByUserAndTarget(
    params: Parameters<UserSubscriptionRepositoryPort['findByUserAndTarget']>[0],
  ): Promise<UserSubscription | null> {
    return [...this.subscriptions.values()].find((subscription) => {
      const snapshot = subscription.toSnapshot();

      return snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.userId === params.userId &&
        snapshot.sourceTargetId === params.sourceTargetId;
    }) ?? null;
  }

  async listByUser(): Promise<never> {
    throw new Error('listByUser is not used by create subscription tests');
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

  async findByInterest(params: Parameters<UserSummaryPreferenceRepositoryPort['findByInterest']>[0]): Promise<UserSummaryPreference | null> {
    return this.preferences.get(params.interestId) ?? null;
  }

  async findEffective(): Promise<UserSummaryPreference | null> {
    return null;
  }
}

class FakeSourceTargetCatalog implements SourceTargetCatalogPort {
  constructor(private readonly result: SourceTargetValidationResult) {}

  validateTarget(): SourceTargetValidationResult {
    return this.result;
  }
}

const now = new Date('2026-06-21T10:00:00.000Z');
const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');

describe('CreateUserSubscriptionUseCase', () => {
  it('creates a target, subscription, schedule, and summary preference', async () => {
    const targets = new FakeSourceTargets();
    const subscriptions = new FakeUserSubscriptions();
    const schedules = new FakeUserSubscriptionSchedules();
    const preferences = new FakeUserSummaryPreferences();
    const useCase = new CreateUserSubscriptionUseCase(
      targets,
      subscriptions,
      schedules,
      preferences,
      new FakeSourceTargetCatalog({
        ok: true,
        descriptor: {
          providerKey: 'reddit',
          targetKind: 'subreddit' satisfies SourceTargetKind,
          targetValue: 'TypeScript',
          normalizedKey: 'subreddit:typescript',
          config: { subreddit: 'TypeScript' },
        },
      }),
      new SequenceIdGenerator(),
      new FixedClock(now),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'TypeScript',
      targetConfig: {},
      schedule: {
        recipientKey: 'recipient-1',
        channel: 'in_app',
        intervalSeconds: 3600,
        includeNoSignal: false,
      },
      summaryPreference: {
        language: 'ru',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 5,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.created).toBe(true);
    expect(result.value.sourceTarget).toEqual(expect.objectContaining({
      providerKey: 'reddit',
      normalizedKey: 'subreddit:typescript',
    }));
    expect(result.value.subscription).toEqual(expect.objectContaining({
      userId: 'user-1',
      sourceTargetId: result.value.sourceTarget.id,
    }));
    expect(result.value.schedule).toEqual(expect.objectContaining({
      channel: 'in_app',
      intervalSeconds: 3600,
      nextRunAt: '2026-06-21T11:00:00.000Z',
    }));
    expect(result.value.summaryPreference).toEqual(expect.objectContaining({
      language: 'ru',
      format: 'bullet_digest',
      tone: 'concise',
      maxKeyPoints: 5,
    }));
  });

  it('rejects invalid source targets before creating records', async () => {
    const targets = new FakeSourceTargets();
    const useCase = new CreateUserSubscriptionUseCase(
      targets,
      new FakeUserSubscriptions(),
      new FakeUserSubscriptionSchedules(),
      new FakeUserSummaryPreferences(),
      new FakeSourceTargetCatalog({ ok: false, reason: 'Unsupported target' }),
      new SequenceIdGenerator(),
      new FixedClock(now),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: '',
      targetConfig: {},
      schedule: {
        recipientKey: 'recipient-1',
        channel: 'in_app',
        intervalSeconds: 3600,
        includeNoSignal: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(targets.targets.size).toBe(0);
    expect(result.ok ? undefined : result.error).toEqual(expect.objectContaining({ code: 'validation.failed' }));
  });
});
