import assert from 'node:assert/strict';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ReaderValueScoringOutcome } from '@social-monitor/relevance/application/contracts/reader-value-assessment-store';
import { DiscoverReaderValueBatchUseCase } from '@social-monitor/relevance/application/use-cases/discover-reader-value-batch.use-case';
import { AssessReaderValueBatchUseCase } from '@social-monitor/relevance/application/use-cases/assess-reader-value-batch.use-case';
import { PrepareReaderValueSummaryUseCase } from '@social-monitor/relevance/application/use-cases/prepare-reader-value-summary.use-case';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import { PrismaReaderValueAssessmentStore } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { PrismaReaderValueExistingAssessment } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-existing-assessment';
import { PrismaReaderValueInventory } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { OpenRouterReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openrouter-reader-value-scorer';
import { OpenAiDecisionsReaderValueScorer } from '@social-monitor/relevance/infrastructure/reader-value/openai-decisions-reader-value-scorer';
import type { ReaderValueScoringProvider } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';
import { JevReaderSummaryCandidateQualification } from '@social-monitor/summary/adapters/evidence/jev-reader-summary-candidate-qualification';
import type { SummaryEvidenceItem } from '@social-monitor/summary/domain';
import { seedAssessmentJob } from './reader-value-postgres-fixture';
import { pipelineClock, pipelineIds, pipelineInterests, seedProviderPipelineSource,
  syntheticProviderResponse, ReaderValueProviderPipelineFailure,
  type ReaderValuePipelineFixture } from './reader-value-provider-pipeline-fixture';

const safety = new SourceContentSafetyPolicy();
const makeScorer = (provider: ReaderValueScoringProvider, key: string, transport: typeof fetch) =>
  provider === 'openai-decisions' ? new OpenAiDecisionsReaderValueScorer(key, pipelineClock, transport)
    : new OpenRouterReaderValueScorer(key, pipelineClock, transport);

/** The only model substitute is the caller's transport. This follows production
 * discovery, summary preparation/pinning and batch-owned dispatch on real Prisma. */
export async function checkReaderValueProviderPipeline(fixture: ReaderValuePipelineFixture,
  provider: ReaderValueScoringProvider, options: {
    readonly transport: typeof fetch; readonly apiKey: string; readonly calls: () => number;
    readonly sourceKind?: 'useful' | 'unrelated'; readonly expectAdmitted?: boolean;
  }) {
  const seeded = await seedProviderPipelineSource(fixture, options.sourceKind);
  const { scope, window } = seeded;
  const interests = pipelineInterests(fixture);
  const inventory = new PrismaReaderValueInventory(fixture.client);
  const builder = new ConservativeReaderValueInputBuilder(safety, provider);
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const rows = await inventory.page(scope, window.startedAt, undefined, 25);
  assert.equal(rows.length, 1, 'inventory reads one real captured source');
  const entry = rows[0]!;
  assert.notEqual(entry.source.availableAt, null, 'production capture provenance is required');
  const prepared = builder.prepare(entry.source, entry.sourceRevisionKey);
  assert(prepared.ok && prepared.value.terminalFailure === undefined, 'production builder creates runnable input');
  const input = prepared.value;
  assert.equal(input.modelConfigVersion, builder.configuration.modelConfigVersion);
  assert.equal(input.inputBuilderVersion, builder.configuration.inputBuilderVersion);
  const discovery = new DiscoverReaderValueBatchUseCase(inventory, builder, store, pipelineIds, pipelineClock);
  const discovered = await discovery.execute({ scopes: [scope], backfillFrom: window.startedAt });
  assert(discovered.ok, 'production discovery succeeds');
  assert.equal(discovered.value.retained, 1);
  assert.equal(discovered.value.assessedCacheHits, 0);

  const jobId = await seedAssessmentJob(fixture.setup, input);
  await fixture.setup.query(`UPDATE reader_summary_jobs SET period_started_at=$2::timestamptz,
    period_ended_at=$3::timestamptz WHERE id=$1::uuid`, [jobId, window.startedAt, window.endedAt]);
  const command = { ...scope, jobId, periodStartedAt: window.startedAt,
    periodEndedAt: window.endedAt, cutoffAt: window.cutoffAt };
  const preparation = new PrepareReaderValueSummaryUseCase(inventory, builder, store,
    pipelineIds, interests, pipelineClock);
  const configuration = await preparation.configuration(command);
  assert(configuration.ok, 'preparation advertises selected configuration');
  assert.equal(configuration.config.modelConfigVersion, builder.configuration.modelConfigVersion);
  assert.equal(configuration.config.inputBuilderVersion, builder.configuration.inputBuilderVersion);
  const firstManifest = await preparation.prepare(command, configuration.config);
  assert(firstManifest.ok, 'production preparation persists and pins the assessment');
  assert.equal(firstManifest.manifest.candidates.length, 1);
  const candidate = firstManifest.manifest.candidates[0]!;
  assert.equal(candidate.inputSha256, input.inputSha256);
  assert.equal(candidate.sourceSnapshotSha256, input.sourceSnapshotSha256);
  const pending = await store.findExact(scope, candidate.assessmentId);
  assert.equal(pending?.state, 'pending');
  assert.equal(pending?.attempts, 0, 'preparation itself does not spend a request');

  const before = options.calls();
  const scorer = makeScorer(provider, options.apiKey, options.transport);
  const outcomes: ReaderValueScoringOutcome[] = [];
  const batch = new AssessReaderValueBatchUseCase(store, { score: async (value) => {
    const outcome = await scorer.score(value); outcomes.push(outcome); return outcome;
  } }, pipelineIds);
  const batchCommand = { ...scope, modelConfigVersion: builder.configuration.modelConfigVersion,
    limit: 1, pinnedOnly: true };
  const scored = await batch.execute(batchCommand);
  if (!scored.ok) throw new ReaderValueProviderPipelineFailure('persistence_unavailable');
  const lastOutcome = outcomes.at(-1);
  if (scored.value.assessed !== 1) throw new ReaderValueProviderPipelineFailure(
    lastOutcome?.ok === false ? lastOutcome.failure.code : 'assessment_incomplete');
  assert.equal(scored.value.dispatched, 1);
  assert.equal(scored.value.assessed, 1);
  assert.equal(scored.value.paused, false);
  assert.equal(options.calls() - before, 1, 'one bounded transport attempt serves this source');

  // Recreate every adapter and application use case against the same database.
  const freshStore = new PrismaReaderValueAssessmentStore(fixture.client);
  const freshInventory = new PrismaReaderValueInventory(fixture.client);
  const freshBuilder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), provider);
  const exact = new PrismaReaderValueExistingAssessment(fixture.client);
  const stored = await exact.find(input);
  assert(stored?.state === 'assessed' && stored.answers !== null);
  assert.equal(stored.id, candidate.assessmentId);
  assert.deepEqual(stored.input, input, 'durable read preserves the immutable wire bytes and every identity field');
  assert.equal(stored.attempts, 1);
  const accounting = (await fixture.setup.query<{
    resolvedModel: string; provider: string; requestId: string | null; latencyMs: number;
    inputTokens: number | null; outputTokens: number | null; costUsd: number | null;
    usageUnknown: boolean; sent: boolean; finished: boolean; pinned: boolean;
  }>(`SELECT resolved_model AS "resolvedModel",provider,request_id AS "requestId",latency_ms AS "latencyMs",
    input_tokens AS "inputTokens",output_tokens AS "outputTokens",cost_usd::double precision AS "costUsd",
    usage_unknown AS "usageUnknown",attempt_history->0->>'sentAt' IS NOT NULL AS sent,
    attempt_history->0->>'finishedAt' IS NOT NULL AS finished,$2::uuid=ANY(pinned_job_ids) AS pinned
    FROM reader_value_assessments WHERE id=$1::uuid`, [stored.id, jobId])).rows[0];
  assert(accounting?.sent && accounting.finished && accounting.pinned,
    'real claim/authorization/completion and active summary pin are durable');
  assert.equal(accounting.provider, provider === 'openai-decisions' ? 'OpenAI' : 'TypeSafe');
  assert.equal(accounting.resolvedModel, provider === 'openai-decisions'
    ? 'gpt-6-luna' : 'typesafe/jev-1.13-20260917');
  if (provider === 'openai-decisions') {
    assert.equal(accounting.costUsd, null);
    assert.equal(accounting.usageUnknown, true);
    assert.equal(stored.costUsd, null);
    assert.equal(stored.usageUnknown, true);
  }

  const beforeReuse = options.calls();
  const freshDiscovery = new DiscoverReaderValueBatchUseCase(freshInventory, freshBuilder,
    freshStore, pipelineIds, pipelineClock);
  const reused = await freshDiscovery.execute({ scopes: [scope], backfillFrom: window.startedAt });
  assert(reused.ok);
  assert.equal(reused.value.assessedCacheHits, 1);
  const freshBatch = new AssessReaderValueBatchUseCase(freshStore,
    makeScorer(provider, options.apiKey, options.transport), pipelineIds);
  const secondTick = await freshBatch.execute(batchCommand);
  assert(secondTick.ok);
  assert.equal(secondTick.value.dispatched, 0);
  const freshPreparation = new PrepareReaderValueSummaryUseCase(freshInventory, freshBuilder,
    freshStore, pipelineIds, pipelineInterests(fixture), pipelineClock);
  const secondManifest = await freshPreparation.prepare(command, configuration.config);
  assert(secondManifest.ok);
  assert.equal(secondManifest.manifestSha256, firstManifest.manifestSha256);
  assert.deepEqual(secondManifest.manifest, firstManifest.manifest);
  const referenceReads = await freshStore.read(scope, scope.interestId,
    secondManifest.manifest.candidates.map((value) => ({
      assessmentId: value.assessmentId, feedItemId: value.candidateId,
      sourceBindingId: value.sourceBindingId, sourceSnapshotSha256: value.sourceSnapshotSha256,
      inputSha256: value.inputSha256,
    })));
  assert.equal(referenceReads.length, 1);
  assert(referenceReads[0]?.status === 'available');
  assert.equal(referenceReads[0].assessment.id, stored.id);
  assert.deepEqual(referenceReads[0].assessment.answers, stored.answers);

  const visible = safety.evaluate({ providerKey: entry.source.providerKey,
    canonicalUrl: entry.source.canonicalUrl, title: entry.source.title, bodyPreview: entry.source.body });
  assert.notEqual(visible.status, 'blocked');
  assert.equal(typeof visible.sanitizedCanonicalUrl, 'string');
  const item: SummaryEvidenceItem = { feedItemId: entry.cursor.feedItemId,
    sourceItemId: entry.source.sourceItemId, sourceBindingId: entry.sourceBindingId,
    interestId: scope.interestId, providerKey: entry.source.providerKey,
    canonicalUrl: visible.sanitizedCanonicalUrl!, title: visible.sanitizedTitle,
    bodyPreview: visible.sanitizedBodyPreview ?? '', sourceText: visible.sanitizedBodyPreview ?? '',
    publishedAt: new Date(entry.cursor.publishedAt), observedAt: new Date(entry.observedAt),
    score: 0, whyImportant: [] };
  const qualifier = new JevReaderSummaryCandidateQualification(freshInventory, freshBuilder,
    exact, pipelineInterests(fixture), pipelineClock, safety, () => undefined);
  const qualified = await qualifier.qualify({ tenantId: tenantId(scope.tenantId),
    workspaceId: workspaceId(scope.workspaceId), scope: { type: 'workspace' },
    period: { cadence: 'daily', startedAt: new Date(window.startedAt), endedAt: new Date(window.endedAt),
      timezone: 'UTC', periodKey: 'daily:provider-pipeline' },
    observedThrough: new Date(window.cutoffAt), maxItems: 10 }, [item]);
  const admitted = ['useful', 'important'].includes(stored.answers.usefulness.choice)
    && ['relevant', 'central'].includes(stored.answers.relevance.choice);
  assert.equal(qualified.items.length, admitted ? 1 : 0);
  assert.deepEqual(qualified.audit.candidates, [{ feedItemId: seeded.feedId, admitted,
    assessmentId: stored.id, inputSha256: input.inputSha256,
    sourceSnapshotSha256: input.sourceSnapshotSha256, interestSha256: input.interestSha256,
    assessedAt: stored.assessedAt }], 'qualification resolves the exact same manifest assessment');
  if (options.expectAdmitted !== undefined) assert.equal(admitted, options.expectAdmitted);
  assert.equal(options.calls() - beforeReuse, 0,
    'fresh discovery, batch, preparation, references and qualification reuse require zero provider calls');

  const otherProvider = provider === 'openai-decisions' ? 'openrouter-systemone' : 'openai-decisions';
  const otherBuilder = new ConservativeReaderValueInputBuilder(safety, otherProvider);
  const other = otherBuilder.prepare(entry.source, entry.sourceRevisionKey);
  assert(other.ok);
  assert.notEqual(other.value.requestSha256, input.requestSha256);
  assert.notEqual(other.value.inputSha256, input.inputSha256);
  assert.notEqual(other.value.modelConfigVersion, input.modelConfigVersion);
  assert.equal(await exact.find(other.value), null, 'other provider cannot reuse this assessed row');
  const separate = await freshStore.ensure(pipelineIds.generate(), other.value);
  assert(separate !== null && separate.id !== stored.id && separate.state === 'pending');
  assert.equal((await exact.find(input))?.id, stored.id, 'other provider insertion preserves exact reuse');
  const mismatch = await new PrepareReaderValueSummaryUseCase(freshInventory, otherBuilder,
    freshStore, pipelineIds, interests, pipelineClock).prepare(command, configuration.config);
  assert.deepEqual(mismatch, { ok: false, code: 'config_unavailable' });

  return { scoringProvider: provider, feedId: seeded.feedId, assessmentId: stored.id, jobId,
    requestedModel: input.requestedModel, ...accounting,
    state: stored.state, attempts: stored.attempts, modelConfigVersion: input.modelConfigVersion,
    inputBuilderVersion: input.inputBuilderVersion, inputSha256: input.inputSha256,
    requestSha256: input.requestSha256, sourceSnapshotSha256: input.sourceSnapshotSha256,
    manifestSha256: secondManifest.manifestSha256,
    usefulness: stored.answers.usefulness.choice, relevance: stored.answers.relevance.choice,
    admittedIds: qualified.items.map((value) => value.feedItemId),
    excludedIds: admitted ? [] : [seeded.feedId], admittedCount: qualified.items.length,
    excludedCount: admitted ? 0 : 1, transportCalls: options.calls() - before,
    reuseCallDelta: options.calls() - beforeReuse, providerSeparation: true };
}

export async function checkPersistedProviderRefusal(fixture: ReaderValuePipelineFixture) {
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const builder = new ConservativeReaderValueInputBuilder(safety, 'openai-decisions');
  let calls = 0;
  const outcomes: ReaderValueScoringOutcome[] = [];
  const transport: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(syntheticProviderResponse('openai-decisions', calls === 1)),
      { headers: { 'x-request-id': `fixture-refusal-${calls}` } });
  };
  const scorer = new OpenAiDecisionsReaderValueScorer('fixture-key', pipelineClock, transport);
  const batch = new AssessReaderValueBatchUseCase(store, { score: async (input) => {
    const outcome = await scorer.score(input); outcomes.push(outcome); return outcome;
  } }, pipelineIds);
  const states = [];
  for (const expected of ['permanent_failed', 'assessed'] as const) {
    const seeded = await seedProviderPipelineSource(fixture);
    const rows = await new PrismaReaderValueInventory(fixture.client).page(seeded.scope,
      seeded.window.startedAt, undefined, 25);
    const prepared = builder.prepare(rows[0]!.source, rows[0]!.sourceRevisionKey);
    assert(prepared.ok);
    const row = await store.ensure(pipelineIds.generate(), prepared.value);
    assert(row);
    const result = await batch.execute({ ...seeded.scope,
      modelConfigVersion: builder.configuration.modelConfigVersion, limit: 1, pinnedOnly: false });
    assert(result.ok && !result.value.paused);
    assert.equal(result.value.dispatched, 1);
    const persisted = await store.findExact(seeded.scope, row.id);
    assert.equal(persisted?.state, expected);
    assert.equal(persisted?.attempts, 1);
    assert.equal(persisted?.errorCode, expected === 'permanent_failed' ? 'provider_refused' : null);
    if (expected === 'permanent_failed') {
      assert.equal(persisted?.answers, null);
      assert.equal(persisted?.costUsd, null);
      assert.equal(persisted?.usageUnknown, true);
    }
    states.push(expected);
  }
  assert.equal(calls, 2, 'one refusal does not pause or automatically retry the worker');
  assert.deepEqual(outcomes.map((outcome) => outcome.ok), [false, true]);
  return { calls, states, refusedItemTerminal: true, subsequentDispatchAssessed: true, paused: batch.isPaused() };
}
