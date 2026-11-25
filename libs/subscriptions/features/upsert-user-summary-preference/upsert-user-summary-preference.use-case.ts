import { type Clock, DomainError, err, type IdGenerator, ok, type Result } from '@social-monitor/shared-kernel';

import { UserSummaryPreference } from '../../domain';
import type {
  RecordUserSummaryPreferenceMemoryCommand,
  UserSubscriptionRepositoryPort,
  UserSummaryPreferenceMemoryProjectorPort,
  UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import { NOOP_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR } from '../../ports';
import { presentUserSummaryPreference } from '../shared/subscription-presenter';
import type { UpsertUserSummaryPreferenceCommand } from './upsert-user-summary-preference.command';
import type { UpsertUserSummaryPreferenceResult } from './upsert-user-summary-preference.result';

type UpsertUserSummaryPreferenceFailure = DomainError | Error;

export class UpsertUserSummaryPreferenceUseCase {
  constructor(
    private readonly subscriptions: UserSubscriptionRepositoryPort,
    private readonly preferences: UserSummaryPreferenceRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly memoryProjector: UserSummaryPreferenceMemoryProjectorPort =
      NOOP_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
  ) {}

  async execute(
    command: UpsertUserSummaryPreferenceCommand,
  ): Promise<Result<UpsertUserSummaryPreferenceResult, UpsertUserSummaryPreferenceFailure>> {
    const userId = command.userId.trim();
    const subscriptionId = normalizeOptionalText(command.subscriptionId);
    const interestId = normalizeOptionalText(command.interestId);

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'User summary preference userId must be non-empty'));
    }

    try {
      if (subscriptionId !== undefined) {
        const subscription = await this.subscriptions.findById({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          subscriptionId,
        });
        const subscriptionSnapshot = subscription?.toSnapshot();

        if (subscriptionSnapshot === undefined || subscriptionSnapshot.userId !== userId) {
          return err(new DomainError('resource.not_found', 'User subscription was not found'));
        }
      }

      const existing = subscriptionId !== undefined
        ? await this.preferences.findBySubscription({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            userId,
            subscriptionId,
          })
        : interestId === undefined
          ? null
          : await this.preferences.findByInterest({
              tenantId: command.tenantId,
              workspaceId: command.workspaceId,
              userId,
              interestId,
            });
      const now = this.clock.now();
      const preference = existing === null
        ? UserSummaryPreference.create({
            id: this.ids.generate(),
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            userId,
            subscriptionId,
            interestId,
            language: command.language,
            format: command.format,
            tone: command.tone,
            maxKeyPoints: command.maxKeyPoints,
            includeRisks: command.includeRisks,
            includeSourceHighlights: command.includeSourceHighlights,
            customInstructions: command.customInstructions,
            createdAt: now,
            updatedAt: now,
          })
        : existing.update({
            language: command.language,
            format: command.format,
            tone: command.tone,
            maxKeyPoints: command.maxKeyPoints,
            includeRisks: command.includeRisks,
            includeSourceHighlights: command.includeSourceHighlights,
            customInstructions: command.customInstructions,
            updatedAt: now,
          });

      await this.preferences.save(preference);
      await this.rememberPreference(preference);

      return ok({
        summaryPreference: presentUserSummaryPreference(preference),
        created: existing === null,
      });
    } catch (error) {
      return err(error instanceof Error ? new DomainError('validation.failed', error.message) : new Error('Summary preference upsert failed'));
    }
  }

  private async rememberPreference(preference: UserSummaryPreference): Promise<void> {
    const snapshot = preference.toSnapshot();
    try {
      await this.memoryProjector.recordUserSummaryPreference({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        preferenceId: snapshot.id,
        userId: snapshot.userId,
        subscriptionId: snapshot.subscriptionId,
        interestId: snapshot.interestId,
        language: snapshot.language,
        format: snapshot.format,
        tone: snapshot.tone,
        maxKeyPoints: snapshot.maxKeyPoints,
        includeRisks: snapshot.includeRisks,
        includeSourceHighlights: snapshot.includeSourceHighlights,
        customInstructions: snapshot.customInstructions,
        rulesVersion: snapshot.rulesVersion,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      } satisfies RecordUserSummaryPreferenceMemoryCommand);
    } catch {
      // Preferences are canonical in Social Monitor; memory projection is best-effort.
    }
  }
}

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
