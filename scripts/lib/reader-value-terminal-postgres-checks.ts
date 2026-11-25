import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentSource } from './reader-value-postgres-fixture';
import { SourceContentSafetyPolicy } from '../../libs/relevance/domain/source-content-safety';
import { ConservativeReaderValueInputBuilder, READER_VALUE_MODEL_CONFIG } from '../../libs/relevance/infrastructure/reader-value/reader-value-input-builder';
import { PrismaReaderValueInventory } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { DiscoverReaderValueBatchUseCase } from '../../libs/relevance/application/use-cases/discover-reader-value-batch.use-case';
import { AssessReaderValueBatchUseCase } from '../../libs/relevance/application/use-cases/assess-reader-value-batch.use-case';
import { RunReaderValueTickUseCase } from '../../libs/relevance/application/use-cases/run-reader-value-tick.use-case';
import type { ReaderValueScoringOutcome } from '../../libs/relevance/application/contracts/reader-value-assessment-store';

export async function checkReaderValueTerminalInputs(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  success: ReaderValueScoringOutcome) {
  const invalid = await seedAssessmentSource(fixture.setup);
  const empty = await seedAssessmentSource(fixture.setup);
  const healthy = await seedAssessmentSource(fixture.setup);
  const queued = await seedAssessmentSource(fixture.setup);
  await fixture.setup.query('UPDATE interests SET query=$2 WHERE id=$1',[invalid.input.interestId,'я'.repeat(30_000)]);
  await fixture.setup.query("UPDATE source_items SET title='',body='' WHERE id=$1",[empty.input.sourceItemId]);
  const scopes = [invalid.input,empty.input,healthy.input,queued.input];
  const inventory = new PrismaReaderValueInventory(fixture.client);
  const builder = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const window = '2000-01-01T00:00:00Z';
  const prepare = async (scope: typeof invalid.input) => {
    const row = (await inventory.page(scope,window,undefined,1))[0]; assert(row);
    const result = builder.prepare(row.source,row.sourceRevisionKey); assert(result.ok);
    return result.value;
  };
  const queuedInput = await prepare(queued.input);
  assert(await store.ensure(randomUUID(),queuedInput),'pre-existing queue work');
  const dispatched: string[] = [];
  const createRunner = () => {
    // New instances simulate process restart; only the SQL assessment rows survive.
    const restartedStore = new PrismaReaderValueAssessmentStore(fixture.client);
    const assessment = new AssessReaderValueBatchUseCase(restartedStore,{score:async (input) => {
      assert.equal(input.terminalFailure,undefined);
      dispatched.push(input.interestId);
      return success;
    }},{generate:randomUUID});
    return new RunReaderValueTickUseCase(new DiscoverReaderValueBatchUseCase(inventory,builder,restartedStore,
      {generate:randomUUID},{now:() => new Date()}),assessment,{next:async (cursor) =>
      scopes[cursor ? scopes.findIndex((scope) => scope.workspaceId === cursor.workspaceId)+1 : 0] ?? null},
    {discoveryScopes:scopes,backfillFrom:window,modelConfigVersion:READER_VALUE_MODEL_CONFIG,pinnedOnly:false},restartedStore);
  };
  const first = await createRunner().execute();
  assert.equal(first.health,'ok'); assert.equal(first.invalidInput,1); assert.equal(first.emptyInput,1);
  assert.equal(first.discovered,4); assert.equal(first.assessed,2,'same tick discovers healthy input and services already queued input');
  for (let repeat=0;repeat<3;repeat++) {
    const result = await createRunner().execute();
    assert.equal(result.health,'ok'); assert.equal(result.discovered,4); assert.equal(result.dispatched,0);
  }
  assert.deepEqual(new Set(dispatched),new Set([healthy.input.interestId,queued.input.interestId]));
  assert.equal(dispatched.length,2,'invalid and empty scopes never dispatch, including after restart');
  for (const [seed,code] of [[invalid,'configuration_invalid'],[empty,'empty_input']] as const) {
    const input = await prepare(seed.input);
    const retained = await store.ensure(randomUUID(),input); assert(retained);
    assert.equal(retained.state,'permanent_failed'); assert.equal(retained.errorCode,code);
    assert.equal(retained.attempts,0); assert.equal(retained.usageUnknown,false);
    assert.equal((await new PrismaReaderValueAssessmentStore(fixture.client).ensure(randomUUID(),input))?.id,retained.id);
    const reference = {assessmentId:retained.id,feedItemId:seed.feedId,sourceSnapshotSha256:input.sourceSnapshotSha256,inputSha256:input.inputSha256};
    const read = (await store.read(input,input.interestId,[reference]))[0];
    assert(read?.status === 'available','CP2 scoped contract exposes durable diagnostic');
    assert.equal(read.assessment.errorCode,code);
    assert.equal(read.assessment.input.terminalFailure,code);
    assert.equal(await store.claim(input,READER_VALUE_MODEL_CONFIG,randomUUID(),false),null);
  }
  await fixture.setup.query("UPDATE interests SET query='Corrected interest' WHERE id=$1",[invalid.input.interestId]);
  await fixture.setup.query("UPDATE source_items SET body='Now contains useful text' WHERE id=$1",[empty.input.sourceItemId]);
  const corrected = await createRunner().execute();
  assert.equal(corrected.assessed,2,'changed exact identities can be assessed without resetting terminal outcomes');
}
