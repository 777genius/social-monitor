import { tenantId, workspaceId, type JsonObject } from '@social-monitor/shared-kernel';
import { SourceItem } from '../../domain/entities/source-item';
import { readContentCapture } from '../../domain/value-objects/source-content-capture';
import { sourceItemContentHash, sourceItemProviderContentHash } from '../../domain/value-objects/source-item-content-fingerprint';
import { InMemorySourceItemRepository } from './in-memory-source-item.repository';
import { PrismaSourceItemRepository } from './prisma/prisma-source-item.repository';
import type { PrismaIngestionClient } from './prisma/prisma-ingestion-client';
import type { PrismaSourceItemRecord } from './prisma/prisma-ingestion-records';
import { PrepareReaderValueSummaryUseCase } from '@social-monitor/relevance/application/use-cases/prepare-reader-value-summary.use-case';
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import { readReaderValueCapture } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-capture';
import type { ReaderValueAssessmentStore } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';
import type { ReaderValuePreparationInventory } from '@social-monitor/relevance/application/contracts/reader-value-inventory';

const now = new Date('2026-09-20T00:00:00Z');
const scope = { tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace') };
const source = (metadata: JsonObject, sourceBindingId = 'binding', ingestedAt = now) => SourceItem.rehydrate({
  ...scope, id: 'source', sourceBindingId, externalId: 'item', canonicalUrl: 'https://example.test/item',
  title: 'Title', body: 'Provider native description', publishedAt: now, ingestedAt, metadata,
});

const prismaFixture = () => {
  let record: PrismaSourceItemRecord | null = null;
  const sourceItem: PrismaIngestionClient['sourceItem'] = {
    findFirst: async () => record,
    create: async ({ data }) => (record = { ...data, authorHandle: data.authorHandle ?? null, createdAt: now }),
    update: async ({ data }) => {
      if (record === null) throw new Error('missing fixture record');
      return record = { ...record, ...data };
    },
  };
  return { repository: new PrismaSourceItemRepository({ sourceItem } as PrismaIngestionClient),
    readRecord: () => record };
};
const prismaRepository = () => prismaFixture().repository;

for (const [name, create] of [
  ['memory', () => new InMemorySourceItemRepository()], ['prisma', prismaRepository],
] as const) {
  describe(`${name} provider metadata persistence`, () => {
    it('updates shared-source binding provenance without creating a new content revision', async () => {
      const repository = create();
      const providerKey = 'rss';
      const first = await repository.saveBatch({ ...scope, providerKey,
        items: [source({ kind: 'rss_item' })] });
      const second = await repository.saveBatch({ ...scope, providerKey,
        items: [source({ kind: 'rss_item' }, 'binding-other', new Date('2026-09-20T01:00:00Z'))] });
      const prior = first.items[0]!.persistedItem!.toSnapshot();
      const rebound = second.items[0]!.persistedItem!.toSnapshot();

      expect(second).toMatchObject({ inserted: 0, contentUpdated: 1,
        items: [{ sourceItemId: prior.id, mutationKind: 'content_updated' }] });
      expect(rebound.sourceBindingId).toBe('binding-other');
      expect(sourceItemContentHash(rebound)).toBe(sourceItemContentHash(prior));
      expect(readContentCapture(rebound)?.sourceSnapshotSha256)
        .toBe(readContentCapture(prior)?.sourceSnapshotSha256);
      expect(sourceItemProviderContentHash({ providerKey, snapshot: rebound }))
        .not.toBe(sourceItemProviderContentHash({ providerKey, snapshot: prior }));

      const revised = SourceItem.rehydrate({ ...rebound, body: 'Changed provider text' });
      expect(sourceItemContentHash(revised.toSnapshot())).not.toBe(sourceItemContentHash(rebound));
    });
    it.each<{ providerKey: string; before: JsonObject; after: JsonObject }>([
      { providerKey: 'github-repo-radar', before: { kind: 'github_repository_trend', repository: { language: 'JavaScript', topics: ['old'], license: 'MIT' } },
        after: { kind: 'github_repository_trend', repository: { language: 'TypeScript', topics: ['new'], license: 'Apache-2.0' } } },
      { providerKey: 'rss', before: { kind: 'rss_item', enclosureUrl: 'https://example.test/old.mp3' },
        after: { kind: 'rss_item', enclosureUrl: 'https://example.test/new.mp3' } },
    ])('persists $providerKey metadata-only changes without changing assessment-text identity', async ({ providerKey, before, after }) => {
      const repository = create();
      const first = await repository.saveBatch({ ...scope, providerKey, items: [source(before)] });
      const second = await repository.saveBatch({ ...scope, providerKey, items: [source(after)] });
      const prior = first.items[0]!.persistedItem!.toSnapshot();
      const next = second.items[0]!.persistedItem!.toSnapshot();
      expect(next.metadata).toMatchObject(after);
      expect(next.body).toBe(prior.body);
      expect(readContentCapture(next)?.sourceSnapshotSha256).toBe(readContentCapture(prior)?.sourceSnapshotSha256);
      expect(second.contentUpdated).toBe(1);
      expect(sourceItemProviderContentHash({ providerKey, snapshot: next })).not.toBe(sourceItemProviderContentHash({ providerKey, snapshot: prior }));
    });

    it('persists engagement-only updates while keeping both content identities stable', async () => {
      const repository = create();
      const providerKey = 'hacker-news';
      const first = await repository.saveBatch({ ...scope, providerKey, items: [source({ kind: 'hacker_news_story', points: 1 })] });
      const second = await repository.saveBatch({ ...scope, providerKey, items: [source({ kind: 'hacker_news_story', points: 99 })] });
      const prior = first.items[0]!.persistedItem!.toSnapshot();
      const next = second.items[0]!.persistedItem!.toSnapshot();
      expect(next.metadata).toMatchObject({ points: 99 });
      expect(second.contentUpdated).toBe(0);
      expect(readContentCapture(next)?.sourceSnapshotSha256).toBe(readContentCapture(prior)?.sourceSnapshotSha256);
      const hash = (snapshot: typeof next) => sourceItemProviderContentHash({ providerKey, snapshot });
      expect(hash(next)).toBe(hash(prior));
      expect(hash({ ...next, metadata: { ...next.metadata, articleCaptureAttempt: { attemptedAt: 'later' }, articleContent: { status: 'failed' } } })).toBe(hash(next));
    });
  });
}

it.each([false, true])('retains the durable revision and cutoff clock on a binding-only update (missing provider hash: %s)', async (missingProviderHash) => {
  const { repository, readRecord } = prismaFixture();
  await repository.saveBatch({ ...scope, providerKey: 'rss', items: [source({ kind: 'rss_item' })] });
  const initial = readRecord()!;
  const legacyContentHash = 'legacy-binding-inclusive-revision';
  // Existing rows can still carry the pre-fix binding-inclusive content hash.
  Object.assign(initial, { contentHash: legacyContentHash,
    ...(missingProviderHash ? { providerContentHash: null } : {}) });
  const second = await repository.saveBatch({ ...scope, providerKey: 'rss',
    items: [source({ kind: 'rss_item' }, 'binding-other', new Date('2026-09-20T01:00:00Z'))] });
  const rebound = readRecord()!;

  expect(second.contentUpdated).toBe(1);
  expect(rebound.sourceBindingId).toBe('binding-other');
  expect(rebound.providerContentHash).not.toBe(initial.providerContentHash);
  expect(rebound.contentHash).toBe(legacyContentHash);
  expect(rebound.contentUpdatedAt).toEqual(initial.contentUpdatedAt);

  await repository.saveBatch({ ...scope, providerKey: 'rss', items: [SourceItem.rehydrate({
    ...source({ kind: 'rss_item' }, 'binding-other', new Date('2026-09-20T02:00:00Z')).toSnapshot(),
    body: 'Revised native description',
  })] });
  expect(readRecord()!.contentHash).not.toBe(legacyContentHash);
  expect(readRecord()!.contentUpdatedAt).toEqual(new Date('2026-09-20T02:00:00Z'));
});

it('reuses a Jev assessment after a persisted binding-only change', async () => {
  const { repository, readRecord } = prismaFixture();
  const providerKey = 'rss';
  const firstBinding = '00000000-0000-4000-8000-000000000011';
  const secondBinding = '00000000-0000-4000-8000-000000000012';
  let feedBinding = firstBinding;
  await repository.saveBatch({ ...scope, providerKey,
    items: [source({ kind: 'rss_item', nativeContentComplete: true }, firstBinding)] });

  const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
    operation({ page: async () => {
      const persisted = readRecord()!;
      const capture = readReaderValueCapture(persisted.metadata as JsonObject,
        providerKey, persisted.title, persisted.body);
      return [{ cursor: { publishedAt: '2026-09-20T00:00:00.000000Z',
        feedItemId: '00000000-0000-4000-8000-000000000013' },
      sourceBindingId: feedBinding, observedAt: '2026-09-20T00:00:00.000000Z',
      sourceUpdatedAt: persisted.contentUpdatedAt!.toISOString(),
      sourceRevisionKey: persisted.contentHash, metadata: { kind: 'rss_item' },
      source: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        interestId: '00000000-0000-4000-8000-000000000014', sourceItemId: persisted.id,
        providerKey, canonicalUrl: persisted.canonicalUrl, title: persisted.title,
        body: persisted.body, interest: 'database methods', ...capture } }];
    } }) };
  const assessments = new Map<string, { id: string; input: Parameters<ReaderValueAssessmentStore['ensure']>[1] }>();
  const ensure = jest.fn(async (id: string, input: Parameters<ReaderValueAssessmentStore['ensure']>[1]) => {
    const prior = assessments.get(input.inputSha256);
    if (prior !== undefined) return prior as never;
    const created = { id, input };
    assessments.set(input.inputSha256, created);
    return created as never;
  });
  const pin: ReaderValueAssessmentStore['pin'] = async () => true;
  const pinMock = jest.fn(pin);
  let nextId = 20;
  const subject = new PrepareReaderValueSummaryUseCase(inventory,
    new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()),
    { ensure, pin: pinMock }, { generate: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}` },
    { readCurrent: async () => ({ kind: 'available', interest: {
      tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      interestId: '00000000-0000-4000-8000-000000000014', query: 'database methods',
    } }) });
  const command = { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    interestId: '00000000-0000-4000-8000-000000000014',
    jobId: '00000000-0000-4000-8000-000000000015',
    periodStartedAt: '2026-09-20T00:00:00.000000Z',
    periodEndedAt: '2026-09-21T00:00:00.000000Z',
    cutoffAt: '2026-09-20T23:59:59.000000Z' };
  const configured = await subject.configuration(command);
  expect(configured.ok).toBe(true);
  if (!configured.ok) return;
  const first = await subject.prepare(command, configured.config);
  const originalRevision = readRecord()!.contentHash;

  feedBinding = secondBinding;
  await repository.saveBatch({ ...scope, providerKey,
    items: [source({ kind: 'rss_item', nativeContentComplete: true }, secondBinding, new Date('2026-09-20T01:00:00Z'))] });
  const rebound = await subject.prepare(command, configured.config);

  expect(first.ok).toBe(true);
  expect(rebound.ok).toBe(true);
  if (!first.ok || !rebound.ok) return;
  expect(readRecord()!.contentHash).toBe(originalRevision);
  expect(assessments.size).toBe(1);
  expect(ensure).toHaveBeenCalledTimes(2);
  expect(rebound.manifest.candidates[0]).toMatchObject({
    assessmentId: first.manifest.candidates[0]?.assessmentId,
    sourceRevisionKey: first.manifest.candidates[0]?.sourceRevisionKey,
    sourceBindingId: secondBinding,
  });
  expect(pinMock.mock.calls[1]?.[3][0]).toMatchObject({
    assessmentId: first.manifest.candidates[0]?.assessmentId,
    sourceBindingId: secondBinding,
  });
});
