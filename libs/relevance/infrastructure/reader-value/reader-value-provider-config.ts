import type { ReaderValueScoringConfiguration } from '../../application/contracts/reader-value-scoring-configuration';
import { READER_VALUE_INPUT_VERSION, READER_VALUE_MODEL, READER_VALUE_MODEL_CONFIG,
  READER_VALUE_RUBRIC_SHA256 } from '../../domain/reader-value/reader-value-config';
import { READER_VALUE_RUBRIC_VERSION } from '../../domain/reader-value/reader-value-rubric';

export type ReaderValueScoringProvider = 'openrouter-systemone' | 'openai-decisions';

const jevConfiguration: ReaderValueScoringConfiguration = Object.freeze({
  rubricVersion: READER_VALUE_RUBRIC_VERSION, rubricSha256: READER_VALUE_RUBRIC_SHA256,
  inputBuilderVersion: READER_VALUE_INPUT_VERSION, modelConfigVersion: READER_VALUE_MODEL_CONFIG,
  requestedModel: READER_VALUE_MODEL,
});
const decisionsConfiguration: ReaderValueScoringConfiguration = Object.freeze({
  rubricVersion: READER_VALUE_RUBRIC_VERSION, rubricSha256: READER_VALUE_RUBRIC_SHA256,
  inputBuilderVersion: 'reader-value-input.openai-decisions.v1',
  modelConfigVersion: 'openai-decisions.gpt-6-luna.reader-value.v1', requestedModel: 'gpt-6-luna',
});

export function readerValueScoringConfiguration(provider: ReaderValueScoringProvider): ReaderValueScoringConfiguration {
  if (provider === 'openrouter-systemone') return jevConfiguration;
  if (provider === 'openai-decisions') return decisionsConfiguration;
  throw new Error('Unsupported reader value scoring provider');
}
