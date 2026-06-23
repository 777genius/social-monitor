import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { UserSubscription, UserSummaryPreference } from '../../domain';
import type {
  ListUserSubscriptionsResult,
  RecordUserSummaryPreferenceMemoryCommand,
  UserSubscriptionRepositoryPort,
  UserSummaryPreferenceMemoryProjectorPort,
  UserSummaryPreferenceMemoryProjectionResult,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import { UpsertUserSummaryPreferenceUseCase } from './upsert-user-summary-preference.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-preference-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeUserSummaryPreferences implements UserSummaryPreferenceRepositoryPort {
  readonly preferences = new Map<string, UserSummaryPreference>();

  async save(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();
    this.preferences.set(snapshot.subscriptionId ?? snapshot.topicId ?? snapshot.id, preference);
  }

  async findBySubscription(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findBySubscription']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferences.get(params.subscriptionId) ?? null;
  }

  async findByTopic(
    params: Parameters<UserSummaryPreferenceRepositoryPort['findByTopic']>[0],
  ): Promise<UserSummaryPreference | null> {
    return this.preferences.get(params.topicId) ?? null;
  }

  async findEffective(): Promise<UserSummaryPreference | null> {
    return null;
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

  async findByUserAndTarget(): Promise<UserSubscription | null> {
    return null;
  }

  async listByUser(): Promise<ListUserSubscriptionsResult> {
    return { subscriptions: [] };
  }
}

class CapturingSummaryPreferenceMemoryProjector implements UserSummaryPreferenceMemoryProjectorPort {
  readonly commands: RecordUserSummaryPreferenceMemoryCommand[] = [];

  async recordUserSummaryPreference(
    command: RecordUserSummaryPreferenceMemoryCommand,
  ): Promise<UserSummaryPreferenceMemoryProjectionResult> {
    this.commands.push(command);
    return { status: 'written', diagnostics: { provider: 'memo-stack' } };
  }
}

class FailingSummaryPreferenceMemoryProjector implements UserSummaryPreferenceMemoryProjectorPort {
  async recordUserSummaryPreference(): Promise<UserSummaryPreferenceMemoryProjectionResult> {
    throw new Error('memo-stack unavailable');
  }
}

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const now = new Date('2026-06-21T10:00:00.000Z');

const saveSubscription = async (
  subscriptions: FakeUserSubscriptions,
  params: { readonly id: string; readonly userId: string },
): Promise<void> => {
  await subscriptions.save(UserSubscription.create({
    id: params.id,
    tenantId: tenant,
    workspaceId: workspace,
    userId: params.userId,
    sourceTargetId: 'source-target-1',
    createdAt: now,
    updatedAt: now,
  }));
};

describe('UpsertUserSummaryPreferenceUseCase', () => {
  it('creates a topic-level summary preference', async () => {
    const preferences = new FakeUserSummaryPreferences();
    const memoryProjector = new CapturingSummaryPreferenceMemoryProjector();
    const useCase = new UpsertUserSummaryPreferenceUseCase(
      new FakeUserSubscriptions(),
      preferences,
      new SequenceIdGenerator(),
      new FixedClock(now),
      memoryProjector,
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'ru',
      format: 'bullet_digest',
      tone: 'concise',
      maxKeyPoints: 4,
      includeRisks: true,
      includeSourceHighlights: true,
      customInstructions: 'Prefer product launch signals.',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      created: true,
      summaryPreference: expect.objectContaining({
        id: 'summary-preference-1',
        userId: 'user-1',
        topicId: 'topic-1',
        language: 'ru',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 4,
      }),
    });
    expect(memoryProjector.commands).toEqual([
      expect.objectContaining({
        tenantId: tenant,
        workspaceId: workspace,
        preferenceId: 'summary-preference-1',
        userId: 'user-1',
        topicId: 'topic-1',
        language: 'ru',
        format: 'bullet_digest',
        tone: 'concise',
        maxKeyPoints: 4,
        includeRisks: true,
        includeSourceHighlights: true,
        customInstructions: 'Prefer product launch signals.',
        rulesVersion: 'summary.rules.user-preference.v1',
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  });

  it('updates an existing subscription-level summary preference', async () => {
    const subscriptions = new FakeUserSubscriptions();
    await saveSubscription(subscriptions, { id: 'subscription-1', userId: 'user-1' });
    const preferences = new FakeUserSummaryPreferences();
    await preferences.save(UserSummaryPreference.create({
      id: 'preference-existing',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      language: 'en',
      format: 'executive_brief',
      tone: 'neutral',
      createdAt: now,
      updatedAt: now,
    }));

    const result = await new UpsertUserSummaryPreferenceUseCase(
      subscriptions,
      preferences,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-21T11:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      language: 'ru',
      format: 'risk_brief',
      tone: 'analytical',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      created: false,
      summaryPreference: expect.objectContaining({
        id: 'preference-existing',
        subscriptionId: 'subscription-1',
        language: 'ru',
        format: 'risk_brief',
        tone: 'analytical',
        updatedAt: '2026-06-21T11:00:00.000Z',
      }),
    });
  });

  it('rejects subscription-level preferences for a different user', async () => {
    const subscriptions = new FakeUserSubscriptions();
    await saveSubscription(subscriptions, { id: 'subscription-1', userId: 'user-1' });

    const result = await new UpsertUserSummaryPreferenceUseCase(
      subscriptions,
      new FakeUserSummaryPreferences(),
      new SequenceIdGenerator(),
      new FixedClock(now),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-2',
      subscriptionId: 'subscription-1',
      language: 'ru',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toEqual(expect.objectContaining({ code: 'resource.not_found' }));
  });

  it('rejects an empty user id', async () => {
    const result = await new UpsertUserSummaryPreferenceUseCase(
      new FakeUserSubscriptions(),
      new FakeUserSummaryPreferences(),
      new SequenceIdGenerator(),
      new FixedClock(now),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: ' ',
      topicId: 'topic-1',
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toEqual(expect.objectContaining({ code: 'validation.failed' }));
  });

  it('keeps preference writes canonical when memory projection fails', async () => {
    const preferences = new FakeUserSummaryPreferences();
    const result = await new UpsertUserSummaryPreferenceUseCase(
      new FakeUserSubscriptions(),
      preferences,
      new SequenceIdGenerator(),
      new FixedClock(now),
      new FailingSummaryPreferenceMemoryProjector(),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'ru',
    });

    expect(result.ok).toBe(true);
    expect(preferences.preferences.get('topic-1')?.toSnapshot()).toEqual(expect.objectContaining({
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'ru',
    }));
  });
});
