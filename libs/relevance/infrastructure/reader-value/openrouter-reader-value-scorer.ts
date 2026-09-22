import type { Clock } from '@social-monitor/shared-kernel';
import type { ReaderValueAccounting, ReaderValuePreparedInput, ReaderValueScorer, ReaderValueScoringOutcome } from '../../application/contracts/reader-value-assessment-store';
import { normalizeReaderValuePersistedCostUsd } from
  '../../application/contracts/reader-value-persisted-cost';
import { validateReaderValueAnswers } from '../../domain/reader-value/reader-value-assessment';
import type { ReaderValueFailure, ReaderValueFailureCode } from '../../domain/reader-value/reader-value-failure';
import { readerValueHttpFailure } from './reader-value-http-failure';
import { READER_VALUE_MODEL, READER_VALUE_MODEL_CONFIG, READER_VALUE_RESOLVED_MODEL,
  READER_VALUE_RUBRIC_SHA256, READER_VALUE_INPUT_VERSION } from './reader-value-input-builder';
import { sha256 } from './reader-value-source-snapshot';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
const cost = (value: unknown): number | null => typeof value === 'number'
  ? normalizeReaderValuePersistedCostUsd(value) : null;
const failure = (code: ReaderValueFailureCode, retryable = false): ReaderValueScoringOutcome =>
  ({ ok: false, failure: { code, retryable, pauseDispatch: !retryable, usageUnknown: true } });

/** One bounded attempt, no SDK retry, no raw provider diagnostics. */
export class OpenRouterReaderValueScorer implements ReaderValueScorer {
  constructor(private readonly apiKey: string, private readonly clock: Clock,
    private readonly transport: typeof fetch = fetch) {}

  async score(input: ReaderValuePreparedInput): Promise<ReaderValueScoringOutcome> {
    if (input.terminalFailure) return { ok: false, failure: { code: input.terminalFailure,
      retryable: false, pauseDispatch: false, usageUnknown: false } };
    if (!this.apiKey.trim() || input.requestedModel !== READER_VALUE_MODEL
      || input.modelConfigVersion !== READER_VALUE_MODEL_CONFIG || input.rubricSha256 !== READER_VALUE_RUBRIC_SHA256
      || input.inputBuilderVersion !== READER_VALUE_INPUT_VERSION || sha256(input.requestBody) !== input.requestSha256
      || Buffer.byteLength(input.requestBody) > 56_000) return failure('configuration_invalid');
    const started = this.clock.now().getTime();
    const signal = AbortSignal.timeout(30_000);
    let httpFailure: ReaderValueFailure | null = null;
    try {
      const response = await this.transport('https://openrouter.ai/api/v1/systemone', {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: input.requestBody,
      });
      httpFailure = response.ok ? null
        : readerValueHttpFailure(response.status, response.headers.get('retry-after'), this.clock.now());
      const malformed = (code: ReaderValueFailureCode): ReaderValueScoringOutcome =>
        httpFailure ? { ok: false, failure: httpFailure } : failure(code);
      const reader = response.body?.getReader();
      if (!reader) return malformed('schema_invalid');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 256 * 1024) { await reader.cancel(); return malformed('response_too_large'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      let payload: unknown;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return malformed('schema_invalid'); }
      if (!record(payload)) return malformed('schema_invalid');
      const usage = record(payload.usage) ? payload.usage : {};
      const inputTokens = count(usage.input_tokens);
      const outputTokens = count(usage.output_tokens);
      const costUsd = cost(usage.cost);
      const accounting: ReaderValueAccounting = {
        requestId: typeof payload.id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/u.test(payload.id) ? payload.id : null,
        latencyMs: Math.max(0, this.clock.now().getTime() - started), inputTokens, outputTokens, costUsd,
        usageUnknown: inputTokens === null || outputTokens === null || costUsd === null,
      };
      if (httpFailure) return { ok: false, failure: { ...httpFailure, usageUnknown: accounting.usageUnknown }, execution: accounting };
      const rejected = (code: ReaderValueFailureCode): ReaderValueScoringOutcome => ({ ok: false,
        failure: { code, retryable: false, pauseDispatch: true, usageUnknown: accounting.usageUnknown }, execution: accounting });
      if (payload.model !== READER_VALUE_RESOLVED_MODEL) return rejected('model_version_changed');
      if (payload.provider !== 'TypeSafe') return rejected('provider_changed');
      if (!record(payload.answers) || Object.values(payload.answers).some((answer) => !record(answer) || answer.type !== 'choice')) {
        return rejected('schema_invalid');
      }
      const answers = validateReaderValueAnswers(payload.answers);
      if (!answers.ok) return rejected('schema_invalid');
      return { ok: true, answers: answers.value, execution: { ...accounting,
        resolvedModel: READER_VALUE_RESOLVED_MODEL, provider: 'TypeSafe',
      } };
    } catch {
      if (httpFailure) return { ok: false, failure: httpFailure };
      return failure(signal.aborted ? 'timeout' : 'transport', true);
    }
  }
}
