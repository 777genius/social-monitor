import type { ReaderValuePreparedInput } from '../../application/contracts/reader-value-assessment-store';
import { readerValueSha256 as sha256 } from '../../domain/reader-value/reader-value-config';
import { readerValueScoringConfiguration, type ReaderValueScoringProvider } from './reader-value-provider-config';
import { readerValueLargestQuestionBytes, serializeReaderValueRequest } from './reader-value-request-format';
import { unicodePrefix } from './reader-value-source-snapshot';

/** Bind persisted metadata to the exact provider envelope and captured sent text. */
export function readerValueRequestMatches(input: ReaderValuePreparedInput, provider: ReaderValueScoringProvider): boolean {
  const config = readerValueScoringConfiguration(provider);
  if (Object.entries(config).some(([key, value]) => input[key as keyof typeof config] !== value)
    || Buffer.byteLength(input.requestBody) > 56_000 || sha256(input.requestBody) !== input.requestSha256
    || input.interestSha256 !== input.snapshot.interestSha256
    || input.sourceSnapshotSha256 !== input.snapshot.sourceSnapshotSha256) return false;
  const snapshot = input.snapshot;
  const length = snapshot.sentBodyLength;
  if (length === undefined || !Number.isSafeInteger(length) || length < 0 || length > snapshot.body.length) return false;
  const title = unicodePrefix(snapshot.title, 2000);
  const body = unicodePrefix(snapshot.body, length);
  if (body.length !== length || snapshot.sentTitleLength !== title.length
    || snapshot.sentTextSha256 !== sha256(JSON.stringify({ title, body }))) return false;
  const state = { trusted_interest: snapshot.interest, title, source_text: body,
    context_state: snapshot.capture.availability };
  if (Buffer.byteLength(JSON.stringify(state)) + readerValueLargestQuestionBytes(provider) > 28_000
    || input.requestBody !== serializeReaderValueRequest(provider, state)) return false;
  const baseIdentity = sha256(JSON.stringify({ version: config.inputBuilderVersion,
    interestSha256: input.interestSha256, requestSha256: input.requestSha256 }));
  const revisionIdentity = sha256(JSON.stringify({ version: 'reader-value-revision-binding.v1',
    inputSha256: baseIdentity, sourceRevisionKey: input.sourceRevisionKey }));
  return input.inputSha256 === baseIdentity || input.inputSha256 === revisionIdentity;
}
