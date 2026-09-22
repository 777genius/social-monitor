import { ok } from '@social-monitor/shared-kernel';
import type { ReaderValueInputBuilder } from '../../application/contracts/reader-value-inventory';
import type { ReaderValueSource } from '../../domain/reader-value/reader-value-source';
import { readerValueQuestions, READER_VALUE_RUBRIC_VERSION } from '../../domain/reader-value/reader-value-rubric';
export { READER_VALUE_INPUT_VERSION, READER_VALUE_MODEL,
  READER_VALUE_MODEL_CONFIG, READER_VALUE_RESOLVED_MODEL,
  READER_VALUE_RUBRIC_SHA256 } from '../../domain/reader-value/reader-value-config';
import { READER_VALUE_INPUT_VERSION, READER_VALUE_MODEL,
  READER_VALUE_MODEL_CONFIG, READER_VALUE_RUBRIC_SHA256,
  readerValueSha256 as sha256 } from '../../domain/reader-value/reader-value-config';
import type { SourceContentSafetyPolicy } from '../../domain/source-content-safety';
import { captureReaderValueSourceSnapshot, unicodePrefix } from './reader-value-source-snapshot';

export class ConservativeReaderValueInputBuilder implements ReaderValueInputBuilder {
  constructor(private readonly safety: SourceContentSafetyPolicy) {}
  prepare(source: ReaderValueSource, sourceRevisionKey: string): ReturnType<ReaderValueInputBuilder['prepare']> {
    const prepared = captureReaderValueSourceSnapshot(source, this.safety);
    if (!prepared.ok) return prepared;
    const snapshot = prepared.value;
    const title = unicodePrefix(snapshot.title, 2000);
    const state = (body: string) => ({ trusted_interest: snapshot.interest, title, source_text: body,
      context_state: snapshot.capture.availability });
    const request = (body: string) => JSON.stringify({ model: READER_VALUE_MODEL, state: state(body), questions: readerValueQuestions });
    const longestQuestion = Math.max(...Object.values(readerValueQuestions).map((q) => Buffer.byteLength(JSON.stringify(q))));
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
    const requestBody = terminalFailure ? JSON.stringify({ version: READER_VALUE_INPUT_VERSION,
      terminalFailure, sourceSnapshotSha256: snapshot.sourceSnapshotSha256, interestSha256: snapshot.interestSha256 }) : request(body);
    return ok({ tenantId: source.tenantId, workspaceId: source.workspaceId, interestId: source.interestId,
      sourceItemId: source.sourceItemId, sourceRevisionKey, sourceSnapshotSha256: snapshot.sourceSnapshotSha256,
      interestSha256: snapshot.interestSha256, rubricVersion: READER_VALUE_RUBRIC_VERSION,
      rubricSha256: READER_VALUE_RUBRIC_SHA256, inputBuilderVersion: READER_VALUE_INPUT_VERSION,
      modelConfigVersion: READER_VALUE_MODEL_CONFIG, requestedModel: READER_VALUE_MODEL, requestBody,
      ...(terminalFailure ? { terminalFailure } : {}),
      inputSha256: sha256(JSON.stringify({ version: READER_VALUE_INPUT_VERSION,
        interestSha256: snapshot.interestSha256, requestSha256: sha256(requestBody) })),
      requestSha256: sha256(requestBody), snapshot: { ...snapshot,
        ...(terminalFailure ? { interest: '' } : {}),
        modelInputTruncated: terminalFailure !== undefined || snapshot.retainedSnapshotTruncated || title !== snapshot.title || body !== snapshot.body,
        sentTextSha256: sha256(JSON.stringify({ title: terminalFailure ? '' : title, body })),
        sentTitleLength: terminalFailure ? 0 : title.length, sentBodyLength: body.length },
    });
  }
}
