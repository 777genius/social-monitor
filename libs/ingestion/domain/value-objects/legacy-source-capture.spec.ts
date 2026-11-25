import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { captureNativeText, readContentCapture } from './source-content-capture';
import { legacySourceSnapshotSha256, preserveVerifiedLegacyCapture } from './legacy-source-capture';

const observed = new Date('2026-09-20T00:00:00Z');
const native = {
  id: 'source', tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace'),
  sourceBindingId: 'binding', externalId: 'story', canonicalUrl: 'https://news.ycombinator.com/item?id=1',
  title: 'Story', body: 'Native text', publishedAt: observed, ingestedAt: observed,
  metadata: { externalUrl: 'https://example.test/article' },
};
const legacy = { ...native, body: 'Native text\n\nArticle text:\nA quote containing Article text: is opaque.',
  metadata: { ...native.metadata, articleContent: { status: 'enriched' } },
};

describe('legacy combined source preservation', () => {
  it('preserves an opaque legacy body only with unchanged native/source binding evidence', () => {
    const incoming = captureNativeText(native, 'hacker-news', observed);
    const preserved = preserveVerifiedLegacyCapture(incoming, legacy, 'hacker-news', true);
    expect(preserved.body).toBe(legacy.body);
    expect(preserved.metadata?.contentCapture).toMatchObject({ provenance: 'legacy_combined', availableAt: null, presentationComplete: false });
    expect(readContentCapture(preserved)).toBeUndefined();
    expect(legacySourceSnapshotSha256(preserved)).toMatch(/^[a-f0-9]{64}$/);
    expect(preserveVerifiedLegacyCapture(incoming, legacy, 'hacker-news', false).body).toBe(native.body);
  });

  it('records the proved native revision so later unchanged observations preserve the same digest', () => {
    const incoming = captureNativeText(native, 'hacker-news', observed);
    const first = preserveVerifiedLegacyCapture(incoming, legacy, 'hacker-news', true);
    const next = preserveVerifiedLegacyCapture(incoming, first, 'hacker-news', false);
    expect(next.body).toBe(legacy.body);
    expect(legacySourceSnapshotSha256(next)).toBe(legacySourceSnapshotSha256(first));
  });

  it('never transfers opaque text across binding, URL or native revision changes', () => {
    const incoming = captureNativeText(native, 'hacker-news', observed);
    const first = preserveVerifiedLegacyCapture(incoming, legacy, 'hacker-news', true);
    const changed = captureNativeText({ ...native, body: 'Updated native' }, 'hacker-news', observed);
    expect(preserveVerifiedLegacyCapture(changed, first, 'hacker-news', false).body).toBe('Updated native');
    expect(preserveVerifiedLegacyCapture({ ...incoming, sourceBindingId: 'other' }, legacy, 'hacker-news', true).body).toBe(native.body);
    const moved = captureNativeText({ ...native, metadata: { externalUrl: 'https://example.test/new' } }, 'hacker-news', observed);
    expect(preserveVerifiedLegacyCapture(moved, legacy, 'hacker-news', true).body).toBe(native.body);
  });
});
