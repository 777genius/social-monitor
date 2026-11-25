import type { Clock } from '@social-monitor/shared-kernel';
import type { ReaderValueAccounting, ReaderValuePreparedInput, ReaderValueScorer,
  ReaderValueScoringOutcome } from '../../application/contracts/reader-value-assessment-store';
import type { ReaderValueFailure, ReaderValueFailureCode } from '../../domain/reader-value/reader-value-failure';
import { parseOpenAiDecisionsReaderValueAnswers, readerValueRecord } from './openai-decisions-reader-value-answers';
import { readerValueHttpFailure } from './reader-value-http-failure';
import { readerValueScoringConfiguration } from './reader-value-provider-config';
import { readerValueRequestMatches } from './reader-value-request-guard';

const tokenCount = (value: unknown): number | null => typeof value === 'number'
  && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
const failure = (code: ReaderValueFailureCode, retryable = false, pauseDispatch = !retryable): ReaderValueFailure =>
  ({ code, retryable, pauseDispatch, usageUnknown: true });

/** Exactly one bounded paid attempt. Worker leases and retries remain authoritative. */
export class OpenAiDecisionsReaderValueScorer implements ReaderValueScorer {
  constructor(private readonly apiKey: string, private readonly clock: Clock,
    private readonly transport: typeof fetch = fetch) {}

  async score(input: ReaderValuePreparedInput): Promise<ReaderValueScoringOutcome> {
    if (input.terminalFailure) return { ok: false, failure: { code: input.terminalFailure,
      retryable: false, pauseDispatch: false, usageUnknown: false } };
    if (!this.apiKey.trim() || !readerValueRequestMatches(input, 'openai-decisions')) {
      return { ok: false, failure: failure('configuration_invalid') };
    }
    const started = this.clock.now().getTime();
    const signal = AbortSignal.timeout(30_000);
    let requestId: string | null = null;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let httpFailure: ReaderValueFailure | null = null;
    const accounting = (): ReaderValueAccounting => ({ requestId,
      latencyMs: Math.max(0, this.clock.now().getTime() - started), inputTokens, outputTokens,
      costUsd: null, usageUnknown: true });
    const rejected = (reason: ReaderValueFailure): ReaderValueScoringOutcome =>
      ({ ok: false, failure: reason, execution: accounting() });
    const malformed = (code: ReaderValueFailureCode) => rejected(httpFailure ?? failure(code));
    try {
      const response = await this.transport('https://api.openai.com/v1/decisions', {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: input.requestBody,
      });
      const headerId = response.headers.get('x-request-id');
      requestId = headerId !== null && /^[a-zA-Z0-9_-]{1,200}$/u.test(headerId) ? headerId : null;
      httpFailure = response.ok ? null
        : readerValueHttpFailure(response.status, response.headers.get('retry-after'), this.clock.now());
      const reader = response.body?.getReader();
      if (!reader) return malformed('schema_invalid');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 256 * 1024) {
            try { await reader.cancel(); } catch { /* Keep the bounded-response failure authoritative. */ }
            return malformed('response_too_large');
          }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      let payload: unknown;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return malformed('schema_invalid'); }
      if (!readerValueRecord(payload)) return malformed('schema_invalid');
      if (readerValueRecord(payload.usage)) {
        inputTokens = tokenCount(payload.usage.input_tokens);
        outputTokens = tokenCount(payload.usage.output_tokens);
      }
      if (httpFailure) return rejected(httpFailure);
      const model = readerValueScoringConfiguration('openai-decisions').requestedModel;
      if (payload.model !== model) {
        return rejected(failure('model_version_changed'));
      }
      const parsed = parseOpenAiDecisionsReaderValueAnswers(payload.answers);
      if (!parsed.ok) return rejected(failure(parsed.code, false, parsed.code !== 'provider_refused'));
      return { ok: true, answers: parsed.answers,
        execution: { ...accounting(), resolvedModel: model, provider: 'OpenAI' } };
    } catch {
      return rejected(httpFailure ?? failure(signal.aborted ? 'timeout' : 'transport', true));
    }
  }
}
