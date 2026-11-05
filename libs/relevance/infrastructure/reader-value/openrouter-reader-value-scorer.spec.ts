import { readerValueLabels } from '../../domain/reader-value/reader-value-assessment';
import { OpenRouterReaderValueScorer } from './openrouter-reader-value-scorer';
import { preparedInput } from './reader-value-input-builder.spec-support';
import { READER_VALUE_RESOLVED_MODEL } from './reader-value-input-builder';

const now = new Date('2026-09-20T00:00:00Z');
function response() {
  return { model: READER_VALUE_RESOLVED_MODEL, provider: 'TypeSafe', id: 'fixture-request',
    usage: { input_tokens: 123, output_tokens: 45, cost: 0.001 },
    answers: Object.fromEntries(Object.entries(readerValueLabels).map(([key, labels]) => [key, {
      type: 'choice', choice: String(labels[0]), confidence: 0.8,
      probabilities: Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 1 : 0])),
    }])) };
}
function setup(body: unknown = response(), status = 200, headers = {}) {
  const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
  const scorer = new OpenRouterReaderValueScorer('fixture-key', { now: () => now }, transport);
  return { transport, scorer };
}

describe('OpenRouter System One reader-value transport', () => {
  it('sends exact verified wire bytes once and retains authoritative choice, diagnostics and accounting', async () => {
    const payload = response();
    payload.answers.usefulness = { type: 'choice', choice: 'useful', confidence: 0.9,
      probabilities: { noise: 0, context: 0.6, useful: 0.4, important: 0, insufficient_context: 0 } };
    const { scorer, transport } = setup(payload);
    const input = preparedInput();
    const result = await scorer.score(input);
    expect(result).toMatchObject({ ok: true, answers: { usefulness: { choice: 'useful', choiceDiffersFromArgmax: true } },
      execution: { requestId: 'fixture-request', inputTokens: 123, outputTokens: 45, costUsd: 0.001, usageUnknown: false } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith('https://openrouter.ai/api/v1/systemone', expect.objectContaining({
      method: 'POST', redirect: 'error', body: input.requestBody, signal: expect.any(AbortSignal),
    }));
    expect(input.requestBody).not.toContain('fixture-key');
  });
  it.each(['missing', 'unknown', 'sum', 'type', 'confidence', 'extra'])('atomically rejects %s schema errors', async (kind) => {
    const payload = response();
    if (kind === 'missing') delete payload.answers.relevance;
    if (kind === 'extra') payload.answers.extra = payload.answers.usefulness!;
    if (kind === 'unknown') payload.answers.usefulness!.choice = 'unknown';
    if (kind === 'sum') payload.answers.usefulness!.probabilities.noise = 0.5;
    if (kind === 'type') payload.answers.usefulness!.type = 'text';
    if (kind === 'confidence') payload.answers.usefulness!.confidence = NaN;
    expect(await setup(payload).scorer.score(preparedInput())).toMatchObject({ ok: false, failure: { code: 'schema_invalid', pauseDispatch: true, retryable: false } });
  });
  it.each([['model', 'model_version_changed'], ['provider', 'provider_changed']])('rejects changed %s', async (field, code) => {
    expect(await setup({ ...response(), [field!]: 'unexpected' }).scorer.score(preparedInput()))
      .toMatchObject({ ok: false, failure: { code, pauseDispatch: true } });
  });
  it.each(['schema', 'model', 'provider'])('preserves accounting independently of rejected %s semantics', async (kind) => {
    const payload = response();
    if (kind === 'schema') delete payload.answers.relevance;
    else payload[kind as 'model' | 'provider'] = 'unexpected';
    const outcome = await setup(payload).scorer.score(preparedInput());
    expect(outcome).toMatchObject({ ok: false, failure: { usageUnknown: false }, execution: {
      requestId: 'fixture-request', inputTokens: 123, outputTokens: 45, costUsd: 0.001, usageUnknown: false,
    } });
    expect(outcome).not.toHaveProperty('answers');
  });
  it('retains known billed cost while invalid token counts remain unknown on failure', async () => {
    const payload = response();
    delete payload.answers.relevance;
    payload.usage.input_tokens = -1;
    payload.id = 'invalid request id';
    expect(await setup(payload).scorer.score(preparedInput())).toMatchObject({ ok: false,
      failure: { usageUnknown: true }, execution: { requestId: null, inputTokens: null, outputTokens: 45,
        costUsd: 0.001, usageUnknown: true } });
  });
  it('normalizes fractional provider cost to persisted DECIMAL(20,10) precision', async () => {
    const payload = response();
    payload.usage.cost = 0.0000123456789;

    await expect(setup(payload).scorer.score(preparedInput())).resolves.toMatchObject({ ok: true,
      execution: { costUsd: 0.0000123457, usageUnknown: false } });
  });
  it('retains safe accounting on HTTP failures without retaining the error envelope', async () => {
    const result = await setup({ ...response(), error: { message: 'private-upstream-text' } }, 503).scorer.score(preparedInput());
    expect(result).toMatchObject({ ok: false, execution: { requestId: 'fixture-request', costUsd: 0.001, usageUnknown: false } });
    expect(JSON.stringify(result)).not.toContain('private-upstream-text');
    expect(result).not.toHaveProperty('answers');
  });
  it('rejects accounting outside storage bounds independently of semantic validity', async () => {
    const payload = response();
    payload.usage = { input_tokens: 2 ** 32, output_tokens: 1.5, cost: 1e100 };
    expect(await setup(payload).scorer.score(preparedInput())).toMatchObject({ ok: true,
      execution: { inputTokens: null, outputTokens: null, costUsd: null, usageUnknown: true } });
  });
  it('keeps valid answers with absent usage, unknown cost is null', async () => {
    const payload = { ...response(), usage: undefined };
    expect(await setup(payload).scorer.score(preparedInput())).toMatchObject({ ok: true,
      execution: { usageUnknown: true, inputTokens: null, outputTokens: null, costUsd: null } });
  });
  it.each([401, 402, 403])('pauses auth %s without automatic probes', async (status) => {
    const { scorer, transport } = setup({ secret: 'do-not-retain' }, status);
    const result = await scorer.score(preparedInput());
    expect(result).toMatchObject({ ok: false, failure: { code: 'auth_paused', pauseDispatch: true, retryable: true } });
    expect(JSON.stringify(result)).not.toContain('do-not-retain');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('keeps a known fatal HTTP failure when its optional accounting body cannot be read', async () => {
    const transport: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private transport diagnostic')); },
    }), { status: 401 });
    const result = await new OpenRouterReaderValueScorer('fixture-key', { now: () => now }, transport).score(preparedInput());
    expect(result).toMatchObject({ ok: false, failure: { code: 'auth_paused', pauseDispatch: true, usageUnknown: true } });
    expect(JSON.stringify(result)).not.toContain('private transport diagnostic');
  });
  it.each(['120', 'Sun, 20 Sep 2026 00:02:00 GMT'])('honors Retry-After %s', async (header) => {
    expect(await setup({}, 429, { 'retry-after': header }).scorer.score(preparedInput())).toMatchObject({ ok: false,
      failure: { retryAfterAt: new Date('2026-09-20T00:02:00Z'), retryable: true, pauseDispatch: false } });
  });
  it('bounds response bytes even without Content-Length', async () => {
    expect(await setup('x'.repeat(262_145)).scorer.score(preparedInput()))
      .toMatchObject({ ok: false, failure: { code: 'response_too_large', pauseDispatch: true } });
  });
  it('records an uncertain billed timeout and never retries inside the adapter', async () => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async () => {
        controller.abort(); throw new Error('sensitive upstream error');
      });
      const result = await new OpenRouterReaderValueScorer('fixture-key', { now: () => now }, transport).score(preparedInput());
      expect(result).toEqual({ ok: false, failure: { code: 'timeout', retryable: true, pauseDispatch: false, usageUnknown: true } });
      expect(timeout).toHaveBeenCalledWith(30_000);
      expect(transport).toHaveBeenCalledTimes(1);
    } finally { timeout.mockRestore(); }
  });
  it('rejects corrupted persisted request bytes before HTTP', async () => {
    const { scorer, transport } = setup();
    expect(await scorer.score({ ...preparedInput(), requestBody: '{}' })).toMatchObject({ failure: { code: 'configuration_invalid' } });
    expect(transport).not.toHaveBeenCalled();
  });
});
