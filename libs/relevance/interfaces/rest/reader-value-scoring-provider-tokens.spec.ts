import { readerValueScoringConfiguration } from '../../infrastructure/reader-value/reader-value-provider-config';
import { resolveReaderValueScoringApiKey, resolveReaderValueScoringProvider,
  resolveReaderValueScoringSelection } from './reader-value-scoring-provider-tokens';

describe('reader-value scoring provider selection', () => {
  it('preserves Jev by default independently of configured keys', () => {
    expect(resolveReaderValueScoringProvider({ OPENAI_API_KEY: 'fixture-openai' })).toBe('openrouter-systemone');
    expect(resolveReaderValueScoringSelection({})).toEqual({ provider: 'openrouter-systemone',
      configuration: readerValueScoringConfiguration('openrouter-systemone') });
  });

  it.each(['openrouter-systemone', 'openai-decisions'] as const)('resolves immutable %s identity without credentials', (provider) => {
    const selected = resolveReaderValueScoringSelection({ READER_VALUE_SCORING_PROVIDER: provider });
    expect(selected.configuration).toBe(readerValueScoringConfiguration(provider));
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.configuration)).toBe(true);
    expect(resolveReaderValueScoringApiKey({}, provider, false)).toBe('');
  });

  it.each(['', 'openai', 'auto', 'OPENAI-DECISIONS'])('rejects unsupported selector %s', (provider) => {
    expect(() => resolveReaderValueScoringProvider({ READER_VALUE_SCORING_PROVIDER: provider }))
      .toThrow('READER_VALUE_SCORING_PROVIDER');
  });

  it.each([
    ['openrouter-systemone', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY'],
    ['openai-decisions', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'],
  ] as const)('requires only the selected %s credential for enabled scoring', (provider, selected, other) => {
    expect(() => resolveReaderValueScoringApiKey({ [other]: 'fixture-other' }, provider, true)).toThrow(selected);
    expect(() => resolveReaderValueScoringApiKey({ [selected]: '  ' }, provider, true)).toThrow(selected);
    expect(resolveReaderValueScoringApiKey({ [selected]: ' fixture-selected ' }, provider, true)).toBe('fixture-selected');
  });
});
