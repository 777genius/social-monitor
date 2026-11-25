import { resolveOpenAiSummaryRuntimeSettings } from './openai-responses-summary-runtime-settings';

describe('OpenAI summary runtime settings', () => {
  it('preserves existing constructor defaults and optional transport', () => {
    const settings = resolveOpenAiSummaryRuntimeSettings({});
    expect(settings).toMatchObject({
      apiKey: '',
      endpointUrl: 'https://api.openai.com/v1/responses',
      model: 'gpt-5.4-mini',
      promptVersion: 'summary.prompt.openai.responses.v1',
      evalDatasetVersion: 'summary.eval.mvp.v1',
      timeoutMs: 60_000,
      maxOutputTokens: 4_000,
      inputTokenDivisor: 4,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0,
    });
    expect(settings.fetchFn).toBe(fetch);
  });

  it('normalizes trimmed identity and forwards injected HTTP without calling it', () => {
    const fetchFn = jest.fn(async () => new Response('{}'));
    const settings = resolveOpenAiSummaryRuntimeSettings({
      apiKey: '  example-key  ',
      endpointUrl: '  https://example.test/v1/responses  ',
      model: '  provider-model  ',
      promptVersion: '  prompt.v1  ',
      evalDatasetVersion: '  eval.v1  ',
      timeoutMs: 1_500,
      maxOutputTokens: 512,
      inputTokenDivisor: 3,
      estimatedInputCostUsdPerMillionTokens: 0.5,
      estimatedOutputCostUsdPerMillionTokens: 1.5,
      fetchFn,
    });
    expect(settings).toMatchObject({
      apiKey: 'example-key',
      endpointUrl: 'https://example.test/v1/responses',
      model: 'provider-model',
      promptVersion: 'prompt.v1',
      evalDatasetVersion: 'eval.v1',
      timeoutMs: 1_500,
      maxOutputTokens: 512,
      inputTokenDivisor: 3,
      estimatedInputCostUsdPerMillionTokens: 0.5,
      estimatedOutputCostUsdPerMillionTokens: 1.5,
    });
    expect(settings.fetchFn).toBe(fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses prior strict nonnegative finite and positive integer fallback rules', () => {
    const settings = resolveOpenAiSummaryRuntimeSettings({
      timeoutMs: 0,
      maxOutputTokens: Number.POSITIVE_INFINITY,
      inputTokenDivisor: -1,
      estimatedInputCostUsdPerMillionTokens: Number.NaN,
      estimatedOutputCostUsdPerMillionTokens: -1,
      model: '  ',
    });
    expect(settings).toMatchObject({
      model: 'gpt-5.4-mini',
      timeoutMs: 60_000,
      maxOutputTokens: 4_000,
      inputTokenDivisor: 4,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0,
    });
  });
});
