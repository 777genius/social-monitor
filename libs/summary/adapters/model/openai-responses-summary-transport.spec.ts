import {
  createOpenAiSummaryResponse,
} from './openai-responses-summary-transport';
import { admitOpenAiSummaryHttpResponse } from './openai-responses-summary-http-response-admission';

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

  it('separates HTTP body trust from downstream completion and preserves source identity', () => {
    const providerBody = Object.freeze({ status: 'failed', output: Object.freeze([]) });
    expect(admitOpenAiSummaryHttpResponse({ ok: true, status: 200 }, providerBody)).toBe(providerBody);
    for (const root of [null, [], true, 42, 'text']) {
      expect(() => admitOpenAiSummaryHttpResponse({ ok: true, status: 200 }, root))
        .toThrow('OpenAI response body must be a JSON object');
    }
    expect(providerBody.status).toBe('failed');
  });

  it('gives HTTP error classification precedence over successful-root admission', () => {
    expect(() => admitOpenAiSummaryHttpResponse({ ok: false, status: 401 }, []))
      .toThrow();
    try {
      admitOpenAiSummaryHttpResponse({ ok: false, status: 401 }, Object.freeze({ error: 'synthetic' }));
      throw new Error('Expected HTTP classification');
    } catch (error) {
      expect(error).toMatchObject({ failure: { retryable: false } });
    }
  });
});
