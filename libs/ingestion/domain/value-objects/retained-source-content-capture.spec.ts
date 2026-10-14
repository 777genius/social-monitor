import { captureRetainedSourceContent, readRetainedSourceContentCapture } from './retained-source-content-capture';
import { captureSha256 } from './source-content-capture';

const source = { id: 'original-id', providerKey: 'reddit', canonicalUrl: 'https://example.test/original',
  title: 'Original title', body: '  retained\n🙂 text  ' };
const now = '2026-10-14T18:00:00.123456Z';
describe('retained source capture provenance', () => {
  it('binds exact retained bytes and current clock without asserting original acquisition', () => {
    const capture = captureRetainedSourceContent(source, now);
    expect(capture).toMatchObject({ origin: 'retained_snapshot', availableAt: now,
      presentationComplete: false, availability: 'partial', originalSegmentBoundaries: 'unknown',
      bodyLength: source.body.length, bodySha256: captureSha256(source.body) });
    expect(capture.sourceSnapshotSha256).toBe(captureSha256(JSON.stringify([
      'retained_source_content_capture.v1','retained_snapshot',source.id,source.providerKey,
      source.canonicalUrl,source.title,source.body,now,'partial',false,'unknown'])));
    expect(readRetainedSourceContentCapture({ ...source, metadata: { contentCapture: capture } })).toEqual(capture);
  });
  it.each(['title','body','canonicalUrl','id','providerKey'] as const)('rejects foreign %s', (field) => {
    expect(readRetainedSourceContentCapture({ ...source, [field]: `${source[field]} changed`,
      metadata: { contentCapture: captureRetainedSourceContent(source, now) } })).toBeUndefined();
  });
  it.each([{ availableAt: '2026-09-29T00:00:00Z' }, { presentationComplete: true },
    { origin: 'provider_native' }, { availability: 'complete' }, { extra: true }])('rejects clock/provenance tampering %j', (patch) => {
    expect(readRetainedSourceContentCapture({ ...source, metadata: {
      contentCapture: { ...captureRetainedSourceContent(source, now), ...patch } } })).toBeUndefined();
  });
});
