import type {
  FindEffectiveUserSummaryPreferenceQuery,
  UserSummaryPreferenceOverlay,
  UserSummaryPreferenceReaderPort,
} from '@social-monitor/summary/ports';

import type { UserSummaryPreferenceRepositoryPort } from '../../ports';

export class SubscriptionUserSummaryPreferenceReaderAdapter implements UserSummaryPreferenceReaderPort {
  constructor(private readonly preferences: UserSummaryPreferenceRepositoryPort) {}

  async findEffectivePreference(
    query: FindEffectiveUserSummaryPreferenceQuery,
  ): Promise<UserSummaryPreferenceOverlay | null> {
    const preference = await this.preferences.findEffective(query);

    return preference?.toOverlay() ?? null;
  }
}
