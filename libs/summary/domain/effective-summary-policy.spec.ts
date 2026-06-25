import {
  defaultReaderSummaryGenerationPolicy,
  defaultSummaryGenerationPolicy,
} from './index';
import {
  resolveEffectiveReaderSummaryPolicy,
  resolveEffectiveSummaryPolicy,
} from './effective-summary-policy';

describe('effective summary policy', () => {
  it('overlays user preferences onto legacy summary policy', () => {
    expect(resolveEffectiveSummaryPolicy(defaultSummaryGenerationPolicy(), {
      tone: 'analytical',
      maxKeyPoints: 7,
      includeRisks: false,
      customInstructions: 'Focus on breaking changes.',
      rulesVersion: 'summary.rules.user-preference.v1',
    })).toMatchObject({
      tone: 'analytical',
      maxKeyPoints: 7,
      includeRisks: false,
      customInstructions: 'Focus on breaking changes.',
      rulesVersion: 'summary.rules.policy.v1+summary.rules.user-preference.v1',
    });
  });

  it('overlays user preferences onto reader summary policy without weakening reader-only rules', () => {
    const policy = resolveEffectiveReaderSummaryPolicy(defaultReaderSummaryGenerationPolicy(), {
      language: 'ru',
      format: 'risk_brief',
      tone: 'concise',
      maxKeyPoints: 4,
      includeRisks: false,
      includeSourceHighlights: false,
      customInstructions: 'Не показывать слабые одиночные сигналы.',
      rulesVersion: 'summary.rules.user-preference.v1',
    });

    expect(policy).toEqual({
      language: 'ru',
      format: 'risk_brief',
      tone: 'concise',
      maxStories: 4,
      includeRisks: false,
      includeTopicHighlights: false,
      includeRepeatedSignals: true,
      dedupeStrategy: 'canonical_url_then_title',
      customInstructions: 'Не показывать слабые одиночные сигналы.',
      rulesVersion: 'reader_summary.rules.policy.v1+summary.rules.user-preference.v1',
    });
  });
});
