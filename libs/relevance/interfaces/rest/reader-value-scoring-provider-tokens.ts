import { readerValueScoringConfiguration, type ReaderValueScoringProvider } from
  '../../infrastructure/reader-value/reader-value-provider-config';

export const READER_VALUE_SCORING_PROVIDER = Symbol('READER_VALUE_SCORING_PROVIDER');
export const readerValueScoringProvider = {
  provide: READER_VALUE_SCORING_PROVIDER,
  useFactory: () => resolveReaderValueScoringProvider(process.env),
};

/** Composition-only selection; preparation needs identity, never a credential. */
export const resolveReaderValueScoringProvider = (env: NodeJS.ProcessEnv): ReaderValueScoringProvider => {
  const provider = env.READER_VALUE_SCORING_PROVIDER ?? 'openrouter-systemone';
  if (provider !== 'openrouter-systemone' && provider !== 'openai-decisions') {
    throw new Error('READER_VALUE_SCORING_PROVIDER must be openrouter-systemone or openai-decisions');
  }
  return provider;
};

export const resolveReaderValueScoringSelection = (env: NodeJS.ProcessEnv) => {
  const provider = resolveReaderValueScoringProvider(env);
  return Object.freeze({ provider, configuration: readerValueScoringConfiguration(provider) });
};

export const resolveReaderValueScoringApiKey = (env: NodeJS.ProcessEnv,
  provider: ReaderValueScoringProvider, scoringLoopEnabled: boolean): string => {
  if (!scoringLoopEnabled) return '';
  const name = provider === 'openai-decisions' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  const key = env[name]?.trim() ?? '';
  if (!key) throw new Error(`Enabled reader value scorer requires ${name}`);
  return key;
};
