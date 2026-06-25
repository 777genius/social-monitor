import type { SummaryGenerationPolicy } from './entities/summary-policy';
import type { ReaderSummaryGenerationPolicy } from './entities/reader-summary-policy';
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

export const resolveEffectiveReaderSummaryPolicy = (
  scopePolicy: ReaderSummaryGenerationPolicy,
  userPreference: UserSummaryPreferenceOverlay | null,
): ReaderSummaryGenerationPolicy => {
  if (userPreference === null) {
    return scopePolicy;
  }

  return {
    language: userPreference.language ?? scopePolicy.language,
    format: userPreference.format ?? scopePolicy.format,
    tone: userPreference.tone ?? scopePolicy.tone,
    maxStories: userPreference.maxKeyPoints ?? scopePolicy.maxStories,
    includeRisks: userPreference.includeRisks ?? scopePolicy.includeRisks,
    includeTopicHighlights: userPreference.includeSourceHighlights ?? scopePolicy.includeTopicHighlights,
    includeRepeatedSignals: scopePolicy.includeRepeatedSignals,
    dedupeStrategy: scopePolicy.dedupeStrategy,
    customInstructions: userPreference.customInstructions ?? scopePolicy.customInstructions,
    rulesVersion: `${scopePolicy.rulesVersion}+${userPreference.rulesVersion}`,
  };
};
