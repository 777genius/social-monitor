import type { JsonObject } from '@social-monitor/shared-kernel';
import { readReaderValueCapture } from './reader-value-capture';
import { prepareReaderValueSourceSnapshot, sha256 } from './reader-value-source-snapshot';
import { SourceContentSafetyPolicy } from '../../domain/source-content-safety';

function captured(tail = 'full text', acquiredAt = '2026-09-20T00:00:00.123456Z'): JsonObject {
  const native = { origin: 'provider_native', offset: 0, length: 4, originalLength: 9,
    fullTextSha256: sha256(tail), truncated: true, sourceUrl: 'https://example.test/post',
    finalUrl: 'https://example.test/post', extractionVersion: 'provider_native.v1', availableAt: acquiredAt };
  const contentCapture = { version: 'source_content_capture.v1', native, articleUrl: null,
    sourceSnapshotSha256: sha256(JSON.stringify(['source_content_capture.v1', 'title', 'body', null,
      JSON.stringify([native.origin, native.offset, native.length, native.originalLength, native.fullTextSha256,
        native.truncated, native.sourceUrl, native.finalUrl, native.extractionVersion])])) };
  return { contentCapture };
}

describe('reader-value capture boundary', () => {
  it('does not invent historical availability for legacy or malformed capture', () => {
    expect(readReaderValueCapture({}, 'rss', 'title', 'body')).toMatchObject({ availableAt: null,
      capture: { availability: 'legacy_combined', segments: [] } });
    expect(readReaderValueCapture(captured(), 'rss', 'changed title', 'body').availableAt).toBeNull();
  });

  it('carries the capture digest of discarded bytes and exact available-at without making capture complete', () => {
    expect(readReaderValueCapture(captured(), 'rss', 'title', 'body')).toMatchObject({
      availableAt: '2026-09-20T00:00:00.123456Z', capture: { availability: 'truncated',
        segments: [{ fullTextSha256: sha256('full text'), originalLength: 9, length: 4 }] },
    });
  });

  it('changes assessment source identity on pre-storage tail changes, but not on capture timestamps', () => {
    const prepare = (metadata: JsonObject) => prepareReaderValueSourceSnapshot({
      tenantId: 'tenant', workspaceId: 'workspace', interestId: 'interest', sourceItemId: 'source',
      providerKey: 'rss', canonicalUrl: 'https://example.test/post', title: 'title', body: 'body', interest: 'methods',
      ...readReaderValueCapture(metadata, 'rss', 'title', 'body'),
    }, new SourceContentSafetyPolicy());
    const a = prepare(captured());
    const b = prepare(captured('changed tail'));
    const c = prepare(captured('full text', '2026-09-21T00:00:00Z'));
    if (!a.ok || !b.ok || !c.ok) throw new Error('Invalid fixture');
    expect(a.value.sourceSnapshotSha256).not.toBe(b.value.sourceSnapshotSha256);
    expect(a.value.sourceSnapshotSha256).toBe(c.value.sourceSnapshotSha256);
  });
});
