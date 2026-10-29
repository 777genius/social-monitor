import type { ReaderValuePreparedInput } from '../../application/contracts/reader-value-assessment-store';
import { readerValueLabels } from '../../domain/reader-value/reader-value-assessment';
import { readerValueSha256 as sha256 } from '../../domain/reader-value/reader-value-config';
import { OpenAiDecisionsReaderValueScorer } from './openai-decisions-reader-value-scorer';
import { preparedInput } from './reader-value-input-builder.spec-support';

const now = new Date('2026-10-29T12:00:00Z');
const input = () => preparedInput({}, 'openai-decisions');
type WireAnswer = { name: string; type: string; choice: string; confidence: number;
  probabilities: { value: string; probability: number }[] };
function response() {
  return { model: 'gpt-6-luna', usage: { input_tokens: 123, output_tokens: 0 },
    answers: Object.entries(readerValueLabels).map(([name, labels]): WireAnswer => ({
      name, type: 'choice', choice: labels[0], confidence: 0.8,
      probabilities: labels.map((value, index) => ({ value, probability: index === 0 ? 1 : 0 })),
    })) };
}
function setup(body: unknown = response(), status = 200, headers: Record<string, string> = { 'x-request-id': 'req_fixture' }) {
  const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
  const clock = { now: jest.fn().mockReturnValueOnce(now).mockReturnValue(new Date(now.getTime() + 25)) };
  return { transport, scorer: new OpenAiDecisionsReaderValueScorer('fixture-key', clock, transport) };
}
function replaceRequest(original: ReaderValuePreparedInput, wire: unknown): ReaderValuePreparedInput {
  const requestBody = JSON.stringify(wire);
  const requestSha256 = sha256(requestBody);
  return { ...original, requestBody, requestSha256,
    inputSha256: sha256(JSON.stringify({ version: original.inputBuilderVersion,
      interestSha256: original.interestSha256, requestSha256 })) };
}

describe('OpenAI Decisions reader-value scorer', () => {
  it('sends exact verified bytes once with bounded transport and no Jev response fields', async () => {
    const { scorer, transport } = setup();
    const prepared = input();
    const result = await scorer.score(prepared);
    expect(result).toMatchObject({ ok: true, execution: { resolvedModel: 'gpt-6-luna', provider: 'OpenAI',
      requestId: 'req_fixture', latencyMs: 25, inputTokens: 123, outputTokens: 0, costUsd: null, usageUnknown: true } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith('https://api.openai.com/v1/decisions', {
      method: 'POST', redirect: 'error', signal: expect.any(AbortSignal), body: prepared.requestBody,
      headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
    });
    expect(JSON.stringify(result)).not.toContain('fixture-key');
  });
  it('maps shuffled arrays without replacing authoritative choice or probability ties', async () => {
    const payload = response();
    payload.answers[0] = { name: 'usefulness', type: 'choice', choice: 'useful', confidence: 0.6,
      probabilities: [{ value: 'noise', probability: 0.5 }, { value: 'context', probability: 0.5 },
        { value: 'useful', probability: 0 }, { value: 'important', probability: 0 },
        { value: 'insufficient_context', probability: 0 }].reverse() };
    payload.answers.reverse();
    expect(await setup(payload).scorer.score(input())).toMatchObject({ ok: true,
      answers: { usefulness: { choice: 'useful', confidence: 0.6, choiceDiffersFromArgmax: true,
        probabilityTie: true, probabilities: { noise: 0.5, context: 0.5, useful: 0 } } } });
  });
  it.each(['missing', 'duplicate', 'extra', 'unknown', 'type', 'choice', 'confidence', 'sum',
    'missing_label', 'duplicate_label', 'unknown_label', 'boolean_label', 'negative', 'out_of_range'])(
    'rejects %s atomically with safe accounting', async (kind) => {
      const payload = response();
      const first = payload.answers[0]!;
      if (kind === 'missing') payload.answers.pop();
      if (kind === 'duplicate') payload.answers[1] = first;
      if (kind === 'extra') payload.answers.push(first);
      if (kind === 'unknown') first.name = 'other';
      if (kind === 'type') first.type = 'score';
      if (kind === 'choice') first.choice = 'unknown';
      if (kind === 'confidence') first.confidence = NaN;
      if (kind === 'sum') first.probabilities[0]!.probability = 0.5;
      if (kind === 'missing_label') first.probabilities.pop();
      if (kind === 'duplicate_label') first.probabilities[1] = first.probabilities[0]!;
      if (kind === 'unknown_label') first.probabilities[0]!.value = 'other';
      if (kind === 'boolean_label') (first.probabilities[0] as unknown as { value: boolean }).value = true;
      if (kind === 'negative') first.probabilities[0]!.probability = -1;
      if (kind === 'out_of_range') first.probabilities[0]!.probability = Infinity;
      const result = await setup(payload).scorer.score(input());
      expect(result).toMatchObject({ ok: false, failure: { code: 'schema_invalid', retryable: false,
        pauseDispatch: true, usageUnknown: true }, execution: { requestId: 'req_fixture', latencyMs: 25,
        inputTokens: 123, outputTokens: 0, costUsd: null, usageUnknown: true } });
      expect(result).not.toHaveProperty('answers');
    });
  it('returns an item refusal only after all four expected names and valid choice siblings pass', async () => {
    const payload = response();
    const answers: unknown[] = payload.answers;
    answers[0] = { name: 'usefulness', type: 'refusal' };
    expect(await setup(payload).scorer.score(input())).toMatchObject({ ok: false, failure: {
      code: 'provider_refused', retryable: false, pauseDispatch: false, usageUnknown: true },
    execution: { requestId: 'req_fixture', inputTokens: 123, outputTokens: 0, costUsd: null } });
  });
  it.each(['malformed_choice', 'missing', 'duplicate', 'unknown_refusal', 'malformed_refusal'])(
    'prioritizes schema failure over a refusal with %s sibling data', async (kind) => {
      const payload = response();
      const answers: unknown[] = payload.answers;
      answers[0] = { name: 'usefulness', type: 'refusal' };
      if (kind === 'malformed_choice') payload.answers[1]!.probabilities[0]!.probability = 0.2;
      if (kind === 'missing') answers.pop();
      if (kind === 'duplicate') answers[1] = answers[0];
      if (kind === 'unknown_refusal') answers[1] = { name: 'other', type: 'refusal' };
      if (kind === 'malformed_refusal') answers[1] = { name: null, type: 'refusal' };
      expect(await setup(payload).scorer.score(input())).toMatchObject({ ok: false,
        failure: { code: 'schema_invalid', pauseDispatch: true, retryable: false } });
    });
  it.each([0, 2_147_483_647])('preserves PostgreSQL-safe token count %s and unknown billing', async (count) => {
    const payload = { ...response(), usage: { input_tokens: count, output_tokens: count, cost: 0.0123 } };
    expect(await setup(payload).scorer.score(input())).toMatchObject({ ok: true,
      execution: { inputTokens: count, outputTokens: count, costUsd: null, usageUnknown: true } });
  });
  it.each([-1, 0.5, NaN, Infinity, 2_147_483_648, '123', null])('does not persist invalid token count %s', async (count) => {
    const payload = { ...response(), usage: { input_tokens: count, output_tokens: count } };
    expect(await setup(payload).scorer.score(input())).toMatchObject({ ok: true,
      execution: { inputTokens: null, outputTokens: null, costUsd: null, usageUnknown: true } });
  });
  it('allows missing usage and request identity without inventing accounting', async () => {
    expect(await setup({ ...response(), usage: undefined }, 200, {}).scorer.score(input())).toMatchObject({ ok: true,
      execution: { requestId: null, inputTokens: null, outputTokens: null, costUsd: null, usageUnknown: true } });
  });
  it('uses a sanitized response header id and preserves accounting when model semantics fail', async () => {
    const payload = { ...response(), model: 'different-model', id: 'not-the-header', provider: 'not-a-required-field' };
    expect(await setup(payload, 200, { 'x-request-id': 'invalid request id' }).scorer.score(input())).toMatchObject({ ok: false,
      failure: { code: 'model_version_changed', pauseDispatch: true }, execution: { requestId: null, latencyMs: 25,
        inputTokens: 123, outputTokens: 0, costUsd: null } });
  });
  it.each([401, 402, 403, 408, 429, 500, 503, 400])('retains HTTP %s classification and safe accounting', async (status) => {
    const { scorer, transport } = setup({ ...response(), error: { message: 'private-upstream-message' } }, status,
      { 'x-request-id': 'req_http', 'retry-after': '120' });
    const result = await scorer.score(input());
    const expected = [401, 402, 403].includes(status) ? { code: 'auth_paused', retryable: true, pauseDispatch: true }
      : status === 429 ? { code: 'rate_limited', retryable: true, pauseDispatch: false,
        retryAfterAt: new Date(now.getTime() + 25 + 120_000) }
        : status === 408 || status >= 500 ? { code: 'transport', retryable: true, pauseDispatch: false }
          : { code: 'request_rejected', retryable: false, pauseDispatch: true };
    expect(result).toMatchObject({ ok: false, failure: expected,
      execution: { requestId: 'req_http', latencyMs: 25, inputTokens: 123, outputTokens: 0, costUsd: null } });
    expect(JSON.stringify(result)).not.toContain('private-upstream-message');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(['null', '[]', '"scalar"', '{malformed'])('rejects malformed successful response %s with header accounting', async (body) => {
    const transport: typeof fetch = async () => new Response(body, { headers: { 'x-request-id': 'req_bad' } });
    const result = await new OpenAiDecisionsReaderValueScorer('fixture-key', { now: () => now }, transport).score(input());
    expect(result).toMatchObject({ ok: false, failure: { code: 'schema_invalid', pauseDispatch: true },
      execution: { requestId: 'req_bad', inputTokens: null, outputTokens: null, costUsd: null } });
  });
  it.each(['absent', 'malformed', 'oversized', 'read_failed'])('preserves known HTTP failure when body is %s', async (kind) => {
    const body = kind === 'absent' ? null : kind === 'malformed' ? '{broken'
      : kind === 'oversized' ? 'x'.repeat(262_145) : new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error('private-stream-error')); },
      });
    const transport: typeof fetch = async () => new Response(body, { status: 401, headers: { 'x-request-id': 'req_failure' } });
    const result = await new OpenAiDecisionsReaderValueScorer('fixture-key', { now: () => now }, transport).score(input());
    expect(result).toMatchObject({ ok: false, failure: { code: 'auth_paused', retryable: true, pauseDispatch: true },
      execution: { requestId: 'req_failure', latencyMs: 0, inputTokens: null, outputTokens: null, costUsd: null } });
    expect(JSON.stringify(result)).not.toContain('private-stream-error');
  });
  it.each([false, true])('cancels oversized success bodies and retains their classification when cancellation rejects: %s', async (rejectCancel) => {
    const cancel = jest.fn(() => rejectCancel ? Promise.reject(new Error('private-cancel-error')) : Promise.resolve());
    const transport: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(262_145)); }, cancel,
    }), { headers: { 'x-request-id': 'req_oversized' } });
    expect(await new OpenAiDecisionsReaderValueScorer('fixture-key', { now: () => now }, transport).score(input()))
      .toMatchObject({ ok: false, failure: { code: 'response_too_large', pauseDispatch: true },
        execution: { requestId: 'req_oversized', costUsd: null } });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('keeps received headers on a stream transport failure', async () => {
    const transport: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private-stream-error')); },
    }), { headers: { 'x-request-id': 'req_read' } });
    expect(await new OpenAiDecisionsReaderValueScorer('fixture-key', { now: () => now }, transport).score(input()))
      .toMatchObject({ ok: false, failure: { code: 'transport', retryable: true, pauseDispatch: false },
        execution: { requestId: 'req_read', inputTokens: null, outputTokens: null, costUsd: null } });
  });
  it('records timeout without retrying or leaking the thrown diagnostic', async () => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(async () => {
      controller.abort(); throw new Error('private-transport-error');
    });
    try {
      const result = await new OpenAiDecisionsReaderValueScorer('fixture-key', { now: () => now }, transport).score(input());
      expect(result).toMatchObject({ ok: false, failure: { code: 'timeout', retryable: true, pauseDispatch: false },
        execution: { requestId: null, costUsd: null, usageUnknown: true } });
      expect(timeout).toHaveBeenCalledWith(30_000);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('private-transport-error');
    } finally { timeout.mockRestore(); }
  });
  it.each(['key', 'provider', 'digest', 'model', 'config', 'rubric', 'input_version', 'identity', 'snapshot', 'sent_digest',
    'body_model', 'body_questions', 'body_state', 'body_extra'])('rejects changed %s before HTTP', async (kind) => {
    const { scorer, transport } = setup();
    let prepared = input();
    if (kind === 'provider') prepared = preparedInput();
    if (kind === 'digest') prepared = { ...prepared, requestSha256: '0'.repeat(64) };
    if (kind === 'model') prepared = { ...prepared, requestedModel: 'other' };
    if (kind === 'config') prepared = { ...prepared, modelConfigVersion: 'other' };
    if (kind === 'rubric') prepared = { ...prepared, rubricVersion: 'other' };
    if (kind === 'input_version') prepared = { ...prepared, inputBuilderVersion: 'other' };
    if (kind === 'identity') prepared = { ...prepared, inputSha256: '0'.repeat(64) };
    if (kind === 'snapshot') prepared = { ...prepared, sourceSnapshotSha256: '0'.repeat(64) };
    if (kind === 'sent_digest') prepared = { ...prepared, snapshot: { ...prepared.snapshot, sentTextSha256: '0'.repeat(64) } };
    const wire = JSON.parse(prepared.requestBody);
    if (kind === 'body_model') wire.model = 'other';
    if (kind === 'body_questions') wire.questions[0].choices.pop();
    if (kind === 'body_state') wire.input[0].content[0].data.source_text = 'changed source';
    if (kind === 'body_extra') wire.tools = [{ type: 'web_search' }];
    if (kind.startsWith('body_')) prepared = replaceRequest(prepared, wire);
    const selected = kind === 'key' ? new OpenAiDecisionsReaderValueScorer(' ', { now: () => now }, transport) : scorer;
    expect(await selected.score(prepared)).toMatchObject({ ok: false,
      failure: { code: 'configuration_invalid', retryable: false, pauseDispatch: true } });
    expect(transport).not.toHaveBeenCalled();
  });
  it('accepts the existing source-revision-bound preparation identity', async () => {
    const prepared = input();
    const bound = { ...prepared, inputSha256: sha256(JSON.stringify({ version: 'reader-value-revision-binding.v1',
      inputSha256: prepared.inputSha256, sourceRevisionKey: prepared.sourceRevisionKey })) };
    expect(await setup().scorer.score(bound)).toMatchObject({ ok: true });
  });
  it.each(['empty_input', 'configuration_invalid'] as const)('never dispatches terminal %s diagnostics', async (terminalFailure) => {
    const { scorer, transport } = setup();
    expect(await scorer.score({ ...input(), terminalFailure })).toEqual({ ok: false,
      failure: { code: terminalFailure, retryable: false, pauseDispatch: false, usageUnknown: false } });
    expect(transport).not.toHaveBeenCalled();
  });
});
