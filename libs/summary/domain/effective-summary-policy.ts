import type { SummaryGenerationPolicy } from './entities/summary-policy';
import type { UserSummaryPreferenceOverlay } from '../ports/user-summary-preference-reader.port';

export const resolveEffectiveSummaryPolicy = (
  topicPolicy: SummaryGenerationPolicy,
  userPreference: UserSummaryPreferenceOverlay | null,
): SummaryGenerationPolicy => {
  if (userPreference === null) {
    return topicPolicy;
  }

  return {
    language: userPreference.language ?? topicPolicy.language,
    format: userPreference.format ?? topicPolicy.format,
    tone: userPreference.tone ?? topicPolicy.tone,
    maxKeyPoints: userPreference.maxKeyPoints ?? topicPolicy.maxKeyPoints,
    includeRisks: userPreference.includeRisks ?? topicPolicy.includeRisks,
    includeSourceHighlights: userPreference.includeSourceHighlights ?? topicPolicy.includeSourceHighlights,
    customInstructions: userPreference.customInstructions ?? topicPolicy.customInstructions,
    rulesVersion: `${topicPolicy.rulesVersion}+${userPreference.rulesVersion}`,
  };
};
