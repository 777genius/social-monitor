import {
  resolveOpenAiResponsesSummaryModelOptions as legacyEntrypoint,
} from './openai-responses-summary-model.adapter';
import { resolveOpenAiResponsesSummaryModelOptions } from './openai-responses-summary-options';

describe('OpenAI summary model environment configuration boundary', () => {
  const optional = { requireApiKey: false } as const;

  it('retains the original exported entrypoint without importing the adapter runtime', () => {
    expect(legacyEntrypoint).toBe(resolveOpenAiResponsesSummaryModelOptions);
  });

  it('preserves explicit model, prompt, dataset and endpoint configuration', () => {
    expect(resolveOpenAiResponsesSummaryModelOptions({
      OPENAI_RESPONSES_ENDPOINT_URL: 'https://example.test/responses',
      OPENAI_SUMMARY_MODEL: 'fixture-model',
      OPENAI_SUMMARY_PROMPT_VERSION: 'fixture-prompt',
      SUMMARY_EVAL_DATASET_VERSION: 'fixture-dataset',
    }, optional)).toMatchObject({
      apiKey: '', endpointUrl: 'https://example.test/responses',
      model: 'fixture-model', promptVersion: 'fixture-prompt',
      evalDatasetVersion: 'fixture-dataset',
    });
  });

  it('parses strictly positive integer budgets and finite nonnegative costs', () => {
    expect(resolveOpenAiResponsesSummaryModelOptions({
      OPENAI_SUMMARY_TIMEOUT_MS: '600',
      OPENAI_SUMMARY_MAX_OUTPUT_TOKENS: '25',
      OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS: '0',
      OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS: '0.25',
    }, optional)).toMatchObject({ timeoutMs: 600, maxOutputTokens: 25,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0.25 });

    expect(resolveOpenAiResponsesSummaryModelOptions({
      OPENAI_SUMMARY_TIMEOUT_MS: '0',
      OPENAI_SUMMARY_MAX_OUTPUT_TOKENS: '-3',
      OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS: '-1',
      OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS: 'Infinity',
    }, optional)).toMatchObject({ timeoutMs: undefined, maxOutputTokens: undefined,
      estimatedInputCostUsdPerMillionTokens: undefined,
      estimatedOutputCostUsdPerMillionTokens: undefined });
  });

  it('fails closed for required credentials and permits empty optional credentials', () => {
    expect(() => resolveOpenAiResponsesSummaryModelOptions({}, { requireApiKey: true }))
      .toThrow('SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE');
    expect(resolveOpenAiResponsesSummaryModelOptions({}, optional).apiKey).toBe('');
  });
});
