import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentSource } from './reader-value-postgres-fixture';
import { ConservativeReaderValueInputBuilder } from '../../libs/relevance/infrastructure/reader-value/reader-value-input-builder';
import { OpenRouterReaderValueScorer } from '../../libs/relevance/infrastructure/reader-value/openrouter-reader-value-scorer';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { SourceContentSafetyPolicy } from '../../libs/relevance/domain/source-content-safety';
import { readerValueLabels, validateReaderValueAnswers } from '../../libs/relevance/domain/reader-value/reader-value-assessment';
import type { ReaderValuePreparedInput } from '../../libs/relevance/application/contracts/reader-value-assessment-store';

export async function checkReaderValueIdentityAccounting(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>) {
  const { setup, client } = fixture;
  const store = new PrismaReaderValueAssessmentStore(client);
  const { input } = await seedAssessmentSource(setup);
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
  const prepare = (interest: string) => {
    const result = builder.prepare({ ...input, ...input.snapshot, interest,
      providerKey: 'rss', canonicalUrl: 'https://example.test/post' }, 'fixture');
    assert(result.ok);
    return result.value;
  };
  const first = prepare('Testing methods password=fixture-one');
  await setup.query('UPDATE interests SET query=$2 WHERE id=$1', [input.interestId, 'Testing methods password=fixture-one']);
  const previous = await store.ensure(randomUUID(), first); assert(previous);
  const answers = validateReaderValueAnswers(Object.fromEntries(Object.entries(readerValueLabels).map(([key, labels]) => [key, {
    choice: labels[0], confidence: 1, probabilities: Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 1 : 0])),
  }])));
  assert(answers.ok);
  const originalClaim = await store.claim(input, first.modelConfigVersion, randomUUID(), false); assert(originalClaim);
  assert.equal(originalClaim.id, previous.id);
  assert(await store.authorizeDispatch(originalClaim,false));
  assert(await store.complete(originalClaim, { ok: true, answers: answers.value, execution: {
    requestId: 'fixture-original-success', resolvedModel: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe',
    latencyMs: 1, inputTokens: 123, outputTokens: 45, costUsd: 0.001, usageUnknown: false,
  } }));
  assert.equal((await store.findExact(input, previous.id))?.state, 'assessed');
  const edited = prepare('Testing methods password=fixture-two');
  await setup.query('UPDATE interests SET query=$2 WHERE id=$1', [input.interestId, 'Testing methods password=fixture-two']);
  assert.equal(first.requestBody, edited.requestBody);
  assert.notEqual(first.inputSha256, edited.inputSha256);
  const current = await store.ensure(randomUUID(), edited); assert(current);
  assert.notEqual(previous.id, current.id, 'same interest ID with redacted edit cannot reuse old assessment');
  assert.equal((await store.ensure(randomUUID(), edited))?.id, current.id);

  await checkFailedAccounting(fixture, store, current.id, false);
  await checkFractionalCostAccounting(fixture, store, prepare, input);

  const partial = prepare('Testing methods password=fixture-three');
  await setup.query('UPDATE interests SET query=$2 WHERE id=$1', [input.interestId, 'Testing methods password=fixture-three']);
  const partialRow = await store.ensure(randomUUID(), partial); assert(partialRow);
  await checkFailedAccounting(fixture, store, partialRow.id, true);
  const retryable = prepare('Testing methods password=fixture-four');
  await setup.query('UPDATE interests SET query=$2 WHERE id=$1', [input.interestId, 'Testing methods password=fixture-four']);
  const retryableRow = await store.ensure(randomUUID(), retryable); assert(retryableRow);
  await checkFinalizedAttemptImmutability(fixture, store, retryableRow.id);
}

async function checkFractionalCostAccounting(
  fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  store: PrismaReaderValueAssessmentStore,
  prepare: (interest: string) => ReaderValuePreparedInput,
  input: Awaited<ReturnType<typeof seedAssessmentSource>>['input'],
) {
  const fractional = prepare('Testing methods fractional cost');
  await fixture.setup.query('UPDATE interests SET query=$2 WHERE id=$1',
    [input.interestId, 'Testing methods fractional cost']);
  const row = await store.ensure(randomUUID(), fractional); assert(row);
  const claim = await store.claim(input, fractional.modelConfigVersion, randomUUID(), false); assert(claim);
  assert.equal(claim.id, row.id, 'fractional-cost accounting must claim the exact assessment it created');
  assert(await store.authorizeDispatch(claim, false));
  const answers = validateReaderValueAnswers(Object.fromEntries(Object.entries(readerValueLabels).map(([key, labels]) => [key, {
    choice: labels[0], confidence: 1, probabilities: Object.fromEntries(labels.map((label, index) => [label, index === 0 ? 1 : 0])),
  }])));
  assert(answers.ok);
  assert(await store.complete(claim, { ok: true, answers: answers.value, execution: {
    requestId: 'fixture-fractional-cost', resolvedModel: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe',
    latencyMs: 1, inputTokens: 1, outputTokens: 1, costUsd: 0.0000123456789, usageUnknown: false,
  } }));
  const persisted = (await fixture.setup.query(
    'SELECT state,cost_usd::text AS cost_usd,attempt_history FROM reader_value_assessments WHERE id=$1', [row.id],
  )).rows[0];
  assert.equal(persisted.state, 'assessed');
  assert.equal(persisted.cost_usd, '0.0000123457');
  assert.equal(persisted.attempt_history[0].costUsd, 0.0000123457);
  assert.equal(await store.claim(input, fractional.modelConfigVersion, randomUUID(), false), null,
    'a successfully persisted fractional cost must not reserve a second paid attempt');
}

async function checkFinalizedAttemptImmutability(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  store: PrismaReaderValueAssessmentStore, assessmentId: string) {
  const { setup } = fixture;
  const identity = (await setup.query('SELECT tenant_id,workspace_id,model_config_version FROM reader_value_assessments WHERE id=$1',
    [assessmentId])).rows[0];
  const scope = { tenantId: identity.tenant_id as string, workspaceId: identity.workspace_id as string };
  const first = await store.claim(scope, identity.model_config_version, randomUUID(), false); assert(first);
  assert(await store.authorizeDispatch(first,false));
  assert(await store.complete(first, { ok: false,
    failure: { code: 'transport', retryable: true, pauseDispatch: false, usageUnknown: false },
    execution: { requestId: 'fixture-retryable', latencyMs: 7, inputTokens: 10, outputTokens: 2,
      costUsd: 0.002, usageUnknown: false } }));
  await expectRuntimeUpdateRejected(fixture, scope,
    `UPDATE reader_value_assessments SET attempt_history=jsonb_set(attempt_history,'{0,requestId}','"forged"'::jsonb)
      WHERE id=$1`, [assessmentId]);
  await expectRuntimeUpdateRejected(fixture, scope,
    'UPDATE reader_value_assessments SET request_id=$2,cost_usd=0 WHERE id=$1', [assessmentId, 'forged']);

  const finalizedFirst = (await setup.query('SELECT attempt_history FROM reader_value_assessments WHERE id=$1',[assessmentId])).rows[0]
    .attempt_history[0];
  await setup.query("UPDATE reader_value_assessments SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[assessmentId]);
  const second = await store.claim(scope, identity.model_config_version, randomUUID(), false); assert(second);
  const appended = (await setup.query('SELECT attempt_history FROM reader_value_assessments WHERE id=$1',[assessmentId])).rows[0].attempt_history;
  assert.deepEqual(appended[0], finalizedFirst, 'reservation append preserves the complete finalized prefix');
  assert.equal(appended.length, 2);
  assert(await store.authorizeDispatch(second,false));
  assert(await store.complete(second, { ok: false,
    failure: { code: 'schema_invalid', retryable: false, pauseDispatch: true, usageUnknown: false },
    execution: { requestId: 'fixture-permanent', latencyMs: 8, inputTokens: 11, outputTokens: 3,
      costUsd: 0.003, usageUnknown: false } }));
  await expectRuntimeUpdateRejected(fixture, scope,
    `UPDATE reader_value_assessments SET attempt_history=jsonb_set(attempt_history,'{0,costUsd}','0'::jsonb)
      WHERE id=$1`, [assessmentId]);
  await expectRuntimeUpdateRejected(fixture, scope,
    'UPDATE reader_value_assessments SET request_id=$2,cost_usd=0,usage_unknown=false WHERE id=$1',
    [assessmentId, 'forged-permanent']);
  const permanent = (await setup.query('SELECT state,cost_usd,attempt_history FROM reader_value_assessments WHERE id=$1',[assessmentId])).rows[0];
  assert.equal(permanent.state, 'permanent_failed');
  assert.equal(Number(permanent.cost_usd), 0.005);
  assert.deepEqual(permanent.attempt_history[0], finalizedFirst);
}

async function expectRuntimeUpdateRejected(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  scope: { tenantId: string; workspaceId: string }, sql: string, parameters: readonly unknown[]) {
  const connection = await fixture.runtime.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true)",
      [scope.tenantId,scope.workspaceId]);
    await assert.rejects(connection.query(sql,[...parameters]),{code:'23514'});
  } finally {
    await connection.query('ROLLBACK');
    connection.release();
  }
}

async function checkFailedAccounting(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  store: PrismaReaderValueAssessmentStore, assessmentId: string, unknownUsage: boolean) {
  const { setup } = fixture;
  const row = (await setup.query('SELECT tenant_id,workspace_id,model_config_version FROM reader_value_assessments WHERE id=$1', [assessmentId])).rows[0];
  const scope = { tenantId: row.tenant_id as string, workspaceId: row.workspace_id as string };
  const transport: typeof fetch = async () => new Response(JSON.stringify({
    model: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe', id: 'fixture-billed-failure',
    usage: { input_tokens: 123, ...(unknownUsage ? {} : { output_tokens: 45 }), cost: 0.001 }, answers: {},
  }));
  const scorer = new OpenRouterReaderValueScorer('fixture-key', { now: () => new Date('2026-09-20T00:00:00Z') }, transport);
  const claim = await store.claim(scope, row.model_config_version, randomUUID(), false); assert(claim);
  assert.equal(claim.id, assessmentId);
  assert(await store.authorizeDispatch(claim,false));
  const outcome = await scorer.score(claim.input); assert(!outcome.ok);
  assert(await store.complete(claim, outcome));
  const persisted = (await setup.query(`SELECT state,error_code,request_id,input_tokens,output_tokens,cost_usd,
    usage_unknown,usefulness,relevance,context_sufficiency,evidence_basis,result,attempt_history
    FROM reader_value_assessments WHERE id=$1`, [claim.id])).rows[0];
  assert.equal(persisted.state, 'permanent_failed');
  assert.equal(persisted.error_code, 'schema_invalid');
  assert.equal(persisted.request_id, 'fixture-billed-failure');
  assert.equal(persisted.input_tokens, 123);
  assert.equal(persisted.output_tokens, unknownUsage ? null : 45);
  assert.equal(Number(persisted.cost_usd), 0.001);
  assert.equal(persisted.usage_unknown, unknownUsage);
  for (const field of ['usefulness', 'relevance', 'context_sufficiency', 'evidence_basis', 'result']) assert.equal(persisted[field], null);
  assert.equal(persisted.attempt_history[0].requestId, 'fixture-billed-failure');
  assert.equal(persisted.attempt_history[0].costUsd, 0.001);
  assert.equal(persisted.attempt_history[0].inputTokens, 123);
  assert.equal(persisted.attempt_history[0].outputTokens, unknownUsage ? null : 45);
  assert.equal(persisted.attempt_history[0].usageUnknown, unknownUsage);
}
