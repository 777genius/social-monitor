import type { SummaryGenerationPolicy } from './entities/summary-policy';
import type { ReaderSummaryGenerationPolicy } from './entities/reader-summary-policy';
import type { UserSummaryPreferenceOverlay } from '../ports/user-summary-preference-reader.port';

export const resolveEffectiveSummaryPolicy = (
  interestPolicy: SummaryGenerationPolicy,
  userPreference: UserSummaryPreferenceOverlay | null,
): SummaryGenerationPolicy => {
  if (userPreference === null) {
    return interestPolicy;
  }

  return {
    language: userPreference.language ?? interestPolicy.language,
    format: userPreference.format ?? interestPolicy.format,
    tone: userPreference.tone ?? interestPolicy.tone,
    maxKeyPoints: userPreference.maxKeyPoints ?? interestPolicy.maxKeyPoints,
    includeRisks: userPreference.includeRisks ?? interestPolicy.includeRisks,
    includeSourceHighlights: userPreference.includeSourceHighlights ?? interestPolicy.includeSourceHighlights,
    customInstructions: userPreference.customInstructions ?? interestPolicy.customInstructions,
    rulesVersion: `${interestPolicy.rulesVersion}+${userPreference.rulesVersion}`,
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
    includeInterestHighlights: userPreference.includeSourceHighlights ?? scopePolicy.includeInterestHighlights,
    includeRepeatedSignals: scopePolicy.includeRepeatedSignals,
    dedupeStrategy: scopePolicy.dedupeStrategy,
    customInstructions: userPreference.customInstructions ?? scopePolicy.customInstructions,
    rulesVersion: `${scopePolicy.rulesVersion}+${userPreference.rulesVersion}`,
  };
};
