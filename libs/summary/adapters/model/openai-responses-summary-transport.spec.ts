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

  it('rejects a successful HTTP response with a non-object JSON body', async () => {
    await expect(createOpenAiSummaryResponse({
      request: {}, endpointUrl: 'https://example.invalid/v1/responses',
      apiKey: 'synthetic-unit-value', timeoutMs: 250,
      fetchFn: async () => new Response('[]', { status: 200 }),
    })).rejects.toMatchObject({
      failure: {
        kind: 'invalid_schema',
        retryable: false,
        message: 'OpenAI response body must be a JSON object',
      },
    });
  });

  it('classifies transport failures without masking the original message', async () => {
    await expect(createOpenAiSummaryResponse({
      request: {}, endpointUrl: 'https://example.invalid/v1/responses',
      apiKey: 'synthetic-unit-value', timeoutMs: 250,
      fetchFn: async () => { throw new TypeError('synthetic connection reset'); },
    })).rejects.toMatchObject({
      failure: {
        kind: 'provider_unavailable',
        retryable: true,
        message: 'synthetic connection reset',
      },
    });
  });

  it('preserves AbortError identity rather than treating an abort as a retriable network failure', async () => {
    const aborted = new Error('synthetic deadline');
    aborted.name = 'AbortError';
    await expect(createOpenAiSummaryResponse({
      request: {}, endpointUrl: 'https://example.invalid/v1/responses',
      apiKey: 'synthetic-unit-value', timeoutMs: 250,
      fetchFn: async () => { throw aborted; },
    })).rejects.toBe(aborted);
  });
});
