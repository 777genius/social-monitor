import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { UserSummaryPreference } from '../../domain';
import type { UserSummaryPreferenceRepositoryPort } from '../../ports';
import { GetEffectiveUserSummaryPreferenceUseCase } from './get-effective-user-summary-preference.use-case';

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

const tenant = tenantId('tenant-1');
const workspace = workspaceId('workspace-1');
const now = new Date('2026-06-21T10:00:00.000Z');

describe('GetEffectiveUserSummaryPreferenceUseCase', () => {
  it('prefers subscription-level preferences over topic-level preferences', async () => {
    const preferences = new FakeUserSummaryPreferences();
    await preferences.save(UserSummaryPreference.create({
      id: 'topic-preference',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'en',
      format: 'executive_brief',
      tone: 'neutral',
      createdAt: now,
      updatedAt: now,
    }));
    await preferences.save(UserSummaryPreference.create({
      id: 'subscription-preference',
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

    const result = await new GetEffectiveUserSummaryPreferenceUseCase(preferences).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      subscriptionId: 'subscription-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      source: 'subscription',
      summaryPreference: expect.objectContaining({
        id: 'subscription-preference',
        subscriptionId: 'subscription-1',
        language: 'ru',
      }),
    });
  });

  it('falls back to topic-level preferences when a subscription overlay does not exist', async () => {
    const preferences = new FakeUserSummaryPreferences();
    await preferences.save(UserSummaryPreference.create({
      id: 'topic-preference',
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      language: 'ru',
      format: 'risk_brief',
      tone: 'analytical',
      createdAt: now,
      updatedAt: now,
    }));

    const result = await new GetEffectiveUserSummaryPreferenceUseCase(preferences).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
      subscriptionId: 'subscription-missing',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({
      source: 'topic',
      summaryPreference: expect.objectContaining({
        id: 'topic-preference',
        topicId: 'topic-1',
        language: 'ru',
      }),
    });
  });

  it('returns an explicit none source when no preference exists', async () => {
    const result = await new GetEffectiveUserSummaryPreferenceUseCase(new FakeUserSummaryPreferences()).execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: 'topic-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual({ source: 'none' });
  });

  it('rejects empty user or topic identifiers', async () => {
    const useCase = new GetEffectiveUserSummaryPreferenceUseCase(new FakeUserSummaryPreferences());

    const emptyUser = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: ' ',
      topicId: 'topic-1',
    });
    const emptyTopic = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      userId: 'user-1',
      topicId: ' ',
    });

    expect(emptyUser.ok).toBe(false);
    expect(emptyUser.ok || emptyUser.error.code).toBe('validation.failed');
    expect(emptyTopic.ok).toBe(false);
    expect(emptyTopic.ok || emptyTopic.error.code).toBe('validation.failed');
  });
});
