import type {
  FindEffectiveUserSummaryPreferenceQuery,
  UserSummaryPreferenceOverlay,
  UserSummaryPreferenceReaderPort,
} from '../../ports';

export class NoopUserSummaryPreferenceReader implements UserSummaryPreferenceReaderPort {
  async findEffectivePreference(
    query: FindEffectiveUserSummaryPreferenceQuery,
  ): Promise<UserSummaryPreferenceOverlay | null> {
    void query;

    return null;
  }
}
