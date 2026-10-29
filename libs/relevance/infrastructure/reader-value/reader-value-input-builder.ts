import { ok } from '@social-monitor/shared-kernel';
import type { ReaderValueInputBuilder } from '../../application/contracts/reader-value-inventory';
import type { ReaderValueSource } from '../../domain/reader-value/reader-value-source';
export { READER_VALUE_INPUT_VERSION, READER_VALUE_MODEL,
  READER_VALUE_MODEL_CONFIG, READER_VALUE_RESOLVED_MODEL,
  READER_VALUE_RUBRIC_SHA256 } from '../../domain/reader-value/reader-value-config';
import { readerValueSha256 as sha256 } from '../../domain/reader-value/reader-value-config';
import type { SourceContentSafetyPolicy } from '../../domain/source-content-safety';
import { captureReaderValueSourceSnapshot, unicodePrefix } from './reader-value-source-snapshot';
import { readerValueScoringConfiguration, type ReaderValueScoringProvider } from './reader-value-provider-config';
import { readerValueLargestQuestionBytes, serializeReaderValueRequest } from './reader-value-request-format';

export class ConservativeReaderValueInputBuilder implements ReaderValueInputBuilder {
  readonly configuration;
  constructor(private readonly safety: SourceContentSafetyPolicy,
    private readonly provider: ReaderValueScoringProvider = 'openrouter-systemone') {
    this.configuration = readerValueScoringConfiguration(provider);
  }
  prepare(source: ReaderValueSource, sourceRevisionKey: string): ReturnType<ReaderValueInputBuilder['prepare']> {
    const prepared = captureReaderValueSourceSnapshot(source, this.safety);
    if (!prepared.ok) return prepared;
    const snapshot = prepared.value;
    const title = unicodePrefix(snapshot.title, 2000);
    const state = (body: string) => ({ trusted_interest: snapshot.interest, title, source_text: body,
      context_state: snapshot.capture.availability });
    const request = (body: string) => serializeReaderValueRequest(this.provider, state(body));
    const longestQuestion = readerValueLargestQuestionBytes(this.provider);
    const fits = (body: string) => Buffer.byteLength(JSON.stringify(state(body))) + longestQuestion <= 28_000
      && Buffer.byteLength(request(body)) <= 56_000;
    const terminalFailure = !source.interest.trim() || !fits('') ? 'configuration_invalid'
      : snapshot.safety === 'blocked' ? 'empty_input' : undefined;
    let low = 0;
    let high = terminalFailure ? 0 : snapshot.body.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(unicodePrefix(snapshot.body, mid))) low = mid; else high = mid - 1;
    }
    const body = unicodePrefix(snapshot.body, low);
    // A diagnostic envelope is not an OpenRouter request. Full digests preserve exact
    // identity without retaining an unbounded invalid interest or dispatching it.
    const config = this.configuration;
    const requestBody = terminalFailure ? JSON.stringify({ version: config.inputBuilderVersion,
      terminalFailure, sourceSnapshotSha256: snapshot.sourceSnapshotSha256, interestSha256: snapshot.interestSha256 }) : request(body);
    return ok({ tenantId: source.tenantId, workspaceId: source.workspaceId, interestId: source.interestId,
      sourceItemId: source.sourceItemId, sourceRevisionKey, sourceSnapshotSha256: snapshot.sourceSnapshotSha256,
      interestSha256: snapshot.interestSha256, ...config, requestBody,
      ...(terminalFailure ? { terminalFailure } : {}),
      inputSha256: sha256(JSON.stringify({ version: config.inputBuilderVersion,
        interestSha256: snapshot.interestSha256, requestSha256: sha256(requestBody) })),
      requestSha256: sha256(requestBody), snapshot: { ...snapshot,
        ...(terminalFailure ? { interest: '' } : {}),
        modelInputTruncated: terminalFailure !== undefined || snapshot.retainedSnapshotTruncated || title !== snapshot.title || body !== snapshot.body,
        sentTextSha256: sha256(JSON.stringify({ title: terminalFailure ? '' : title, body })),
        sentTitleLength: terminalFailure ? 0 : title.length, sentBodyLength: body.length },
    });
  }
}
