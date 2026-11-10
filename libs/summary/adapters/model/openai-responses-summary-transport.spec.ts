import {
  createOpenAiSummaryResponse,
} from './openai-responses-summary-transport';

describe('OpenAI summary transport', () => {
  it('preserves request payload, credentials, and response body without rewriting', async () => {
    const input = { model: 'synthetic-model', store: false };
    const fetchFn = jest.fn(async (url: string | URL, init?: RequestInit) => {
      expect(url).toBe('https://example.invalid/v1/responses');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        authorization: ['Bearer', 'synthetic-unit-value'].join(' '),
      });
      expect(JSON.parse(String(init?.body))).toEqual(input);
      return new Response(JSON.stringify({ status: 'completed', output: [] }), { status: 200 });
    });
    const result = await createOpenAiSummaryResponse({
      request: input, endpointUrl: 'https://example.invalid/v1/responses',
      apiKey: 'synthetic-unit-value', timeoutMs: 250, fetchFn,
    });
    expect(result).toEqual({ status: 'completed', output: [] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps HTTP failure classification fail-closed', async () => {
    const fetchFn = jest.fn(async () => new Response('{}', { status: 401 }));
    await expect(createOpenAiSummaryResponse({
      request: {}, endpointUrl: 'https://example.invalid/v1/responses',
      apiKey: 'synthetic-unit-value', timeoutMs: 250, fetchFn,
    })).rejects.toMatchObject({ failure: { retryable: false } });
  });
});
