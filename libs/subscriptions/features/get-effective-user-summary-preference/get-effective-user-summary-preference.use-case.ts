import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { UserSummaryPreferenceRepositoryPort } from '../../ports';
import { presentUserSummaryPreference } from '../shared/subscription-presenter';
import type { GetEffectiveUserSummaryPreferenceQuery } from './get-effective-user-summary-preference.query';
import type {
  EffectiveUserSummaryPreferenceSource,
  GetEffectiveUserSummaryPreferenceResult,
} from './get-effective-user-summary-preference.result';

type GetEffectiveUserSummaryPreferenceFailure = DomainError;

export class GetEffectiveUserSummaryPreferenceUseCase {
  constructor(private readonly preferences: UserSummaryPreferenceRepositoryPort) {}

  async execute(
    query: GetEffectiveUserSummaryPreferenceQuery,
  ): Promise<Result<GetEffectiveUserSummaryPreferenceResult, GetEffectiveUserSummaryPreferenceFailure>> {
    const userId = query.userId.trim();
    const interestId = query.interestId.trim();
    const subscriptionId = normalizeOptionalText(query.subscriptionId);

    if (userId.length === 0) {
      return err(new DomainError('validation.failed', 'User summary preference userId must be non-empty'));
    }

    if (interestId.length === 0) {
      return err(new DomainError('validation.failed', 'User summary preference interestId must be non-empty'));
    }

    const preference = await this.preferences.findEffective({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      userId,
      interestId,
      subscriptionId,
    });

    if (preference === null) {
      return ok({ source: 'none' });
    }

    return ok({
      summaryPreference: presentUserSummaryPreference(preference),
      source: resolvePreferenceSource(preference.toSnapshot().subscriptionId),
    });
  }
}

const resolvePreferenceSource = (
  subscriptionId: string | undefined,
): EffectiveUserSummaryPreferenceSource => (subscriptionId === undefined ? 'interest' : 'subscription');

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
