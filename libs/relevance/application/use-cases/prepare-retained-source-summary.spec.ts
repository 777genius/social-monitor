import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ReaderValueAssessmentStore } from '../contracts/reader-value-assessment-store';
import type { ReaderValueInventoryItem, ReaderValuePreparationInventory } from '../contracts/reader-value-inventory';
import { PrepareReaderValueSummaryUseCase } from './prepare-reader-value-summary.use-case';
import { ConservativeReaderValueInputBuilder } from '../../infrastructure/reader-value/reader-value-input-builder';
import { readReaderValueCapture } from '../../infrastructure/reader-value/reader-value-capture';
import { sha256 } from '../../infrastructure/reader-value/reader-value-source-snapshot';
import { SourceContentSafetyPolicy } from '../../domain/source-content-safety';

// Consumer fixture encodes the public capture schema, without importing ingestion.
const version = 'retained_source_content_capture.v1';
const now = '2026-10-14T18:00:00.123456Z';
const source = { tenantId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',interestId: '00000000-0000-4000-8000-000000000003',
  sourceItemId: '00000000-0000-4000-8000-000000000004',providerKey: 'reddit',
  canonicalUrl: 'https://example.test/original',title: 'Database method limits',
  body: '  Original evidence\nwith explicit uncertainty. ',interest: 'database methods' };
const metadata = { contentCapture: { version,origin: 'retained_snapshot',sourceItemId: source.sourceItemId,
  providerKey: source.providerKey,availableAt: now,availability: 'partial',presentationComplete: false,
  originalSegmentBoundaries: 'unknown',bodySha256: sha256(source.body),bodyLength: source.body.length,
  sourceSnapshotSha256: sha256(JSON.stringify([version,'retained_snapshot',source.sourceItemId,
    source.providerKey,source.canonicalUrl,source.title,source.body,now,'partial',false,'unknown'])) } };
const reader = (meta = metadata) => readReaderValueCapture(meta, source.providerKey,source.title,source.body,
  { sourceItemId: source.sourceItemId,canonicalUrl: source.canonicalUrl });
const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
const legacy = builder.prepare({ ...source,...readReaderValueCapture({},source.providerKey,source.title,source.body) }, 'original-revision');

function fixture() {
  const item: ReaderValueInventoryItem = { cursor: { feedItemId: '00000000-0000-4000-8000-000000000005',
    publishedAt: '2026-09-29T03:00:00.123456Z' },sourceBindingId: '00000000-0000-4000-8000-000000000006',
    observedAt: '2026-09-29T04:00:00.123456Z',sourceUpdatedAt: now,
    sourceRevisionKey: 'original-revision',metadata: { kind: 'reddit_post' },source: { ...source,...reader() } };
  const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope,operation) =>
    operation({ page: async () => [item] }) };
  const store: jest.Mocked<Pick<ReaderValueAssessmentStore,'ensure'|'pin'>> = {
    ensure: jest.fn(async (id,input) => ({ id,input }) as never),pin: jest.fn(async () => true),
  };
  const subject = new PrepareReaderValueSummaryUseCase(inventory,builder,store,
    { generate: () => '00000000-0000-4000-8000-000000000007' },
    { readCurrent: async () => ({ kind: 'available',interest: { tenantId: tenantId(source.tenantId),
      workspaceId: workspaceId(source.workspaceId),interestId: source.interestId,query: source.interest } }) });
  const prepare = async (cutoffAt: string) => {
    const command = { ...source,jobId: '00000000-0000-4000-8000-000000000008',
      periodStartedAt: '2026-09-29T00:00:00Z',periodEndedAt: '2026-09-30T00:00:00Z',cutoffAt };
    const config = await subject.configuration(command);
    if (!config.ok) throw new Error('Invalid fixture config');
    return subject.prepare(command,config.config);
  };
  return { store,prepare,item };
}
describe('retained snapshot preparation boundary', () => {
  it('refuses historical cutoff before materialization without ensure/pin or clock backdating', async () => {
    const f = fixture();
    expect(await f.prepare('2026-10-14T18:00:00.123455Z')).toEqual({ ok: false,code: 'assessment_snapshot_unavailable' });
    expect(f.store.ensure).not.toHaveBeenCalled(); expect(f.store.pin).not.toHaveBeenCalled();
    expect(f.item.source.availableAt).toBe(now);
  });
  it('ensures a new assessment identity at actual later cutoff while preserving original period/revision and partial evidence', async () => {
    const f = fixture();
    expect(await f.prepare(now)).toMatchObject({ ok: true,manifest: { cutoffAt: now,
      candidates: [{ publishedAt: f.item.cursor.publishedAt,observedAt: f.item.observedAt,sourceRevisionKey: 'original-revision' }] } });
    const input = f.store.ensure.mock.calls[0]![1];
    if (!legacy.ok) throw new Error('Invalid legacy fixture');
    expect(input.sourceSnapshotSha256).not.toBe(legacy.value.sourceSnapshotSha256);
    expect(input.requestSha256).not.toBe(legacy.value.requestSha256);
    expect(input.snapshot.capture).toMatchObject({ availability: 'partial',representationVersion: version,
      segments: [{ origin: 'retained_snapshot',finalUrl: null }] });
    expect(JSON.parse(input.requestBody).state.context_state).toBe('partial');
    expect(input.snapshot.body).toBe(source.body);
    expect(f.store.pin).toHaveBeenCalledTimes(1);
  });
  it('does not reuse an old legacy cache row as an assessment for the new capture', async () => {
    if (!legacy.ok) throw new Error('Invalid fixture');
    const f = fixture();
    f.store.ensure.mockResolvedValue({ id: 'old-assessment',input: legacy.value } as never);
    expect(await f.prepare(now)).toEqual({ ok: false,code: 'assessment_snapshot_unavailable' });
    expect(f.store.pin).not.toHaveBeenCalled();
  });
  it('rejects an unbound provider claim, altered clock, unknown field or missing identity context', () => {
    for (const patch of [{ origin: 'provider_native' },{ presentationComplete: true },
      { availableAt: '2026-09-29T00:00:00Z' },{ extra: true }]) {
      expect(reader({ contentCapture: { ...metadata.contentCapture,...patch } } as typeof metadata).availableAt).toBeNull();
    }
    expect(readReaderValueCapture(metadata,source.providerKey,source.title,source.body).availableAt).toBeNull();
  });
});
