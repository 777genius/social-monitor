import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SourceContentSafetyPolicy } from '../../libs/relevance/domain/source-content-safety';
import { readerValueLabels, validateReaderValueAnswers } from '../../libs/relevance/domain/reader-value/reader-value-assessment';
import { ConservativeReaderValueInputBuilder, READER_VALUE_MODEL_CONFIG } from '../../libs/relevance/infrastructure/reader-value/reader-value-input-builder';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { DiscoverReaderValueBatchUseCase } from '../../libs/relevance/application/use-cases/discover-reader-value-batch.use-case';
import { AssessReaderValueBatchUseCase } from '../../libs/relevance/application/use-cases/assess-reader-value-batch.use-case';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentJob, seedAssessmentSource } from './reader-value-postgres-fixture';
import { PrismaReaderValueInventory } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { PrismaReaderValueMaintenanceScopes } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-maintenance-scopes';
import { classifyReaderValueSourceKind } from '../../libs/relevance/domain/reader-value/reader-value-source-kind';
import { ReaderValueInventoryByteCeilingExceeded, type ReaderValueInventoryCursor,
  type ReaderValueInventorySnapshot, type ReaderValuePreparationInventory } from
  '../../libs/relevance/application/contracts/reader-value-inventory';
import { PrepareReaderValueSummaryUseCase } from
  '../../libs/relevance/application/use-cases/prepare-reader-value-summary.use-case';
import { seedProductionReaderValueCapture } from './reader-summary-v3-postgres-production-preflight';

export async function checkReaderValueInventory(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>) {
  const seed=await seedAssessmentSource(fixture.setup);
  const { input, feedId }=seed;
  const inventory=new PrismaReaderValueInventory(fixture.client);
  const window='2000-01-01T00:00:00Z';
  const liveScopes=new PrismaReaderValueMaintenanceScopes(fixture.client);
  assert((await liveScopes.nextDiscoverable(undefined,window,25)).some((scope) =>
    scope.tenantId===input.tenantId && scope.workspaceId===input.workspaceId && scope.interestId===input.interestId),
  'live discovery must find an enabled interest with a visible bound post');
  const first=await inventory.page(input,window,undefined,25);
  assert.equal(first.length,1);
  assert.equal(first[0]?.source.body,'full source body','never substitute feed preview');
  assert.equal(first[0]?.source.interest,'Testing methods');
  const revision = await fixture.setup.query<{ content_updated_at: Date }>(
    'SELECT content_updated_at FROM source_items WHERE id=$1', [input.sourceItemId]);
  assert.equal(new Date(first[0]!.sourceUpdatedAt).toISOString(),
    new Date(revision.rows[0]!.content_updated_at).toISOString(),
    'inventory revision time must come from production source_items.content_updated_at');
  assert.equal(first[0]?.source.availableAt,null,'legacy observedAt is not current body availability');
  assert.equal(classifyReaderValueSourceKind(first[0]!.source.providerKey,first[0]!.metadata).supported,true);
  await fixture.setup.query(`WITH ids AS (SELECT gen_random_uuid() AS id FROM generate_series(1,105))
    INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,dedupe_key,
      canonical_url,title,body_preview,published_at,observed_at,updated_at,provider_metadata)
    SELECT ids.id,f.tenant_id,f.workspace_id,f.interest_id,f.source_item_id,f.source_binding_id,f.provider_key,ids.id::text,
      f.canonical_url,f.title,'not source text',f.published_at,f.observed_at,clock_timestamp(),f.provider_metadata
    FROM ids CROSS JOIN feed_items f WHERE f.id=$1`,[feedId]);
  // Persist actual SQL NULL plus legal non-object JSON values before supported rows.
  for (const metadata of [null, '42', '"legacy"', '[]']) {
    await fixture.setup.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,
      provider_key,dedupe_key,canonical_url,title,body_preview,published_at,observed_at,updated_at,provider_metadata)
      SELECT $2::uuid,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,$2::text,
        canonical_url,title,body_preview,published_at-interval '1 second',observed_at,updated_at,$3::jsonb
      FROM feed_items WHERE id=$1`, [feedId, randomUUID(), metadata]);
  }
  const malformed = await inventory.page(input,window,undefined,4);
  assert(malformed.every((row) => !classifyReaderValueSourceKind(row.source.providerKey,row.metadata).supported));
  const seen=new Set<string>();
  let cursor: ReaderValueInventoryCursor|undefined;
  for (let pageIndex=0;pageIndex<6;pageIndex++) {
    const page=await inventory.page(input,window,cursor,25);
    for (const row of page) {
      assert(!seen.has(row.cursor.feedItemId),'keyset pages must not repeat equal-timestamp rows');
      seen.add(row.cursor.feedItemId);
    }
    cursor=page.at(-1)?.cursor;
    if (page.length<25) break;
  }
  assert.equal(seen.size,110,'no legacy 100-row overall discovery ceiling');
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
  const ids = { generate: randomUUID };
  const createDiscovery = () => new DiscoverReaderValueBatchUseCase(inventory, builder, store, ids, { now: () => new Date() });
  const discovery = createDiscovery();
  const discoveryCommand = { scopes: [input], backfillFrom: window };
  const firstTick = await discovery.execute(discoveryCommand);
  assert(firstTick.ok);
  assert.equal(firstTick.value.unsupportedKind,4);
  assert.equal(firstTick.value.retained,96,'malformed metadata must not stall later supported rows');
  const secondTick = await discovery.execute(discoveryCommand);
  assert(secondTick.ok);
  assert.equal(secondTick.value.discovered,10,'pagination advances past NULL metadata across ticks');
  let calls = 0;
  const answers = validateReaderValueAnswers(Object.fromEntries(Object.entries(readerValueLabels).map(([key, labels]) => [key, {
    choice: labels[0], confidence: 1, probabilities: Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 1 : 0])),
  }])));
  assert(answers.ok);
  const batch = new AssessReaderValueBatchUseCase(store, { score: async () => {
    calls += 1;
    return { ok: true, answers: answers.value, execution: { requestId: 'fixture', resolvedModel: 'fixture', provider: 'fixture',
      latencyMs: 1, inputTokens: null, outputTokens: null, costUsd: null, usageUnknown: true } };
  } }, ids);
  const batchCommand = { ...input, modelConfigVersion: READER_VALUE_MODEL_CONFIG, limit: 100, pinnedOnly: false };
  assert((await batch.execute(batchCommand)).ok);
  assert.equal(calls, 1, '106 duplicate FeedItems dispatch one same-interest assessment');
  const restarted = createDiscovery();
  assert((await restarted.execute(discoveryCommand)).ok);
  assert((await restarted.execute(discoveryCommand)).ok);
  assert((await batch.execute(batchCommand)).ok);
  assert.equal(calls, 1, 'restart sweep reuses durable assessed identity without another HTTP attempt');
  await fixture.setup.query("UPDATE source_items SET body='revised old source',content_hash='revision-2',content_updated_at=clock_timestamp() WHERE id=$1",[input.sourceItemId]);
  const swept=await inventory.page(input,window,undefined,25);
  assert(swept.every((row)=>row.source.body==='revised old source'&&row.sourceRevisionKey==='revision-2'));
  assert((await restarted.execute(discoveryCommand)).ok);
  assert((await batch.execute(batchCommand)).ok);
  assert.equal(calls, 2, 'next complete sweep discovers edited old source and scores its new exact input');
  await fixture.setup.query("UPDATE source_items SET body=repeat('x',2*1024*1024),content_hash='oversized-revision',content_updated_at=clock_timestamp() WHERE id=$1",[input.sourceItemId]);
  await assert.rejects(inventory.page(input,window,undefined,25),
    ReaderValueInventoryByteCeilingExceeded,
    'PostgreSQL byte-length preflight rejects before body materialization');
  await fixture.setup.query("UPDATE source_items SET body='revised old source',content_hash='revision-2',content_updated_at=clock_timestamp() WHERE id=$1",[input.sourceItemId]);
  await fixture.setup.query("UPDATE interests SET query='New interest meaning' WHERE id=$1",[input.interestId]);
  assert.equal((await inventory.page(input,window,undefined,25))[0]?.source.interest,'New interest meaning');
  await fixture.setup.query("UPDATE feed_items SET status='TOMBSTONED' WHERE id=$1",[feedId]);
  assert.equal((await inventory.page(input,window,undefined,25)).length,0,'a source revocation blocks its duplicates');
  await fixture.setup.query("UPDATE source_bindings SET status='PAUSED' WHERE id=$1",[first[0]!.sourceBindingId]);
  assert(!(await liveScopes.nextDiscoverable(undefined,window,25)).some((scope) =>
    scope.tenantId===input.tenantId && scope.workspaceId===input.workspaceId && scope.interestId===input.interestId),
  'live discovery must skip an interest when its only source binding is disabled');

  await checkPreparationInventorySnapshot(fixture);

  // Maintenance enumeration deliberately survives rollout removal and visibility revocation.
  const maintenance=new PrismaReaderValueMaintenanceScopes(fixture.client);
  const scope=await maintenance.next(undefined);
  assert(scope,'prior storage scenarios left assessment rows for the independent maintenance scan');
}

async function checkPreparationInventorySnapshot(
  fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
): Promise<void> {
  const seeded = await seedAssessmentSource(fixture.setup);
  const periodStart = '2026-09-20T00:00:00.000000Z';
  const periodEnd = '2026-09-21T00:00:00.000000Z';
  const firstPublishedAt = '2026-09-20T12:00:00.000000Z';
  await fixture.setup.query(`UPDATE feed_items SET published_at=$2::timestamptz,
    observed_at=$2::timestamptz WHERE id=$1::uuid`, [seeded.feedId,firstPublishedAt]);
  await fixture.setup.query(`WITH ids AS (
      SELECT gen_random_uuid() AS id,ordinal FROM generate_series(1,29) ordinal
    ) INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,
      provider_key,dedupe_key,canonical_url,title,body_preview,published_at,observed_at,updated_at,
      provider_metadata)
    SELECT ids.id,f.tenant_id,f.workspace_id,f.interest_id,f.source_item_id,f.source_binding_id,
      f.provider_key,ids.id::text,f.canonical_url,f.title,f.body_preview,
      $2::timestamptz+ids.ordinal*interval '1 second',
      $2::timestamptz+ids.ordinal*interval '1 second',clock_timestamp(),f.provider_metadata
    FROM ids CROSS JOIN feed_items f WHERE f.id=$1::uuid`, [seeded.feedId,firstPublishedAt]);
  const setupClient = await fixture.setup.connect();
  try {
    await seedProductionReaderValueCapture(setupClient,seeded.feedId);
    await setupClient.query(`UPDATE source_items SET content_updated_at=$2::timestamptz
      WHERE id=(SELECT source_item_id FROM feed_items WHERE id=$1::uuid)`,
    [seeded.feedId,firstPublishedAt]);
  } finally {
    setupClient.release();
  }

  const markerBefore = randomUUID();
  const markerAfter = randomUUID();
  const insertEligiblePair = async (): Promise<void> => {
    const ingestion = await fixture.setup.connect();
    try {
      await ingestion.query('BEGIN');
      await ingestion.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,
        source_binding_id,provider_key,dedupe_key,canonical_url,title,body_preview,published_at,
        observed_at,updated_at,provider_metadata)
        SELECT marker.id,f.tenant_id,f.workspace_id,f.interest_id,f.source_item_id,f.source_binding_id,
          f.provider_key,marker.id::text,f.canonical_url,f.title,f.body_preview,marker.published_at,
          marker.published_at,clock_timestamp(),f.provider_metadata
        FROM feed_items f CROSS JOIN (VALUES
          ($2::uuid,$4::timestamptz+interval '5.5 seconds'),
          ($3::uuid,$4::timestamptz+interval '25.5 seconds')) marker(id,published_at)
        WHERE f.id=$1::uuid`,[seeded.feedId,markerBefore,markerAfter,firstPublishedAt]);
      await ingestion.query('COMMIT');
    } catch (error) {
      await ingestion.query('ROLLBACK');
      throw error;
    } finally {
      ingestion.release();
    }
  };

  const durableInventory = new PrismaReaderValueInventory(fixture.client);
  let pageReads = 0;
  const concurrentInventory: ReaderValuePreparationInventory = {
    readSnapshot: (scope, operation) => durableInventory.readSnapshot(scope,
      (snapshot) => operation(interceptFirstPage(snapshot, periodEnd, async () => {
        pageReads += 1;
        await insertEligiblePair();
      }))),
  };
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const diagnosticStore = {
    ensure: async (...args: Parameters<typeof store.ensure>) => {
      const assessment = await store.ensure(...args);
      if (assessment === null) throw new Error('Snapshot preparation ensure returned null');
      return assessment;
    },
    pin: async (...args: Parameters<typeof store.pin>) => {
      const pinned = await store.pin(...args);
      if (!pinned) throw new Error('Snapshot preparation pin returned false');
      return pinned;
    },
  };
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
  const interests = { readCurrent: async () => ({ kind: 'available' as const,
    interest: { tenantId: tenantId(seeded.input.tenantId), workspaceId: workspaceId(seeded.input.workspaceId),
      interestId: seeded.input.interestId, query: 'Testing methods' } }) };
  const command = { tenantId: seeded.input.tenantId, workspaceId: seeded.input.workspaceId,
    interestId: seeded.input.interestId, jobId: await seedAssessmentJob(fixture.setup,seeded.input),
    periodStartedAt: periodStart, periodEndedAt: periodEnd, cutoffAt: periodEnd };
  const prepare = async (inventory: ReaderValuePreparationInventory, jobId: string) => {
    const useCase = new PrepareReaderValueSummaryUseCase(
      inventory,builder,diagnosticStore,{generate:randomUUID},interests,
    );
    const configuration = await useCase.configuration({...command,jobId});
    assert(configuration.ok);
    const result = await useCase.prepare({...command,jobId},configuration.config);
    if (!result.ok) throw new Error(`Snapshot preparation failed: ${result.code}`);
    return result.manifest.candidates.map((candidate) => candidate.candidateId);
  };

  const before = await prepare(concurrentInventory,command.jobId);
  assert.equal(pageReads,1,'concurrent ingestion commits after the first preparation page');
  assert.equal(before.length,30,'one snapshot sees the complete pre-commit inventory');
  assert(!before.includes(markerBefore) && !before.includes(markerAfter),
    'one snapshot cannot mix one side of the concurrent ingestion commit');

  const after = await prepare(durableInventory,await seedAssessmentJob(fixture.setup,seeded.input));
  assert.equal(after.length,32,'the next snapshot sees the complete post-commit inventory');
  assert(after.includes(markerBefore) && after.includes(markerAfter),
    'post-commit preparation includes both rows inserted by the same ingestion commit');
}

function interceptFirstPage(snapshot: ReaderValueInventorySnapshot, cutoffAt: string,
  afterFirstPage: () => Promise<void>): ReaderValueInventorySnapshot {
  let first = true;
  return { page: async (...args) => {
    const rows = await snapshot.page(...args);
    for (const row of rows) {
      if (row.source.availableAt === null || row.source.availableAt > cutoffAt ||
          row.sourceUpdatedAt > cutoffAt) {
        throw new Error(`Snapshot fixture is unavailable at cutoff: ${JSON.stringify({
          availableAt: row.source.availableAt,
          sourceUpdatedAt: row.sourceUpdatedAt,
          cutoffAt,
        })}`);
      }
    }
    if (first) {
      first = false;
      await afterFirstPage();
    }
    return rows;
  } };
}
