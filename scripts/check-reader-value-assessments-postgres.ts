import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assessmentPostgresFixture, seedAssessmentJob, seedAssessmentSource } from './lib/reader-value-postgres-fixture';
import { PrismaReaderValueAssessmentStore } from '../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { readerValueLabels, validateReaderValueAnswers } from '../libs/relevance/domain/reader-value/reader-value-assessment';
import type { ReaderValueAssessment, ReaderValuePreparedInput, ReaderValueScoringOutcome } from '../libs/relevance/application/contracts/reader-value-assessment-store';
import { checkReaderValueInventory } from './lib/reader-value-inventory-postgres-checks';
import { checkReaderValuePhysicalDeletion } from './lib/reader-value-deletion-postgres-checks';
import { checkReaderValueIdentityAccounting } from './lib/reader-value-identity-accounting-postgres-checks';

import { checkReaderValueReferences } from './lib/reader-value-reference-postgres-checks';
import { checkReaderValueTerminalInputs } from './lib/reader-value-terminal-postgres-checks';

import { checkReaderValuePinRaces } from './lib/reader-value-pin-race-postgres-checks';

const policy = {version:'reader-value-retention.v1',retentionHoldWorkspaceIds:[],eraseRevokedScopes:true} as const;
const validated = validateReaderValueAnswers(Object.fromEntries(Object.entries(readerValueLabels).map(([key,labels]) => [key,{
  choice:labels[0],confidence:0.8,probabilities:Object.fromEntries(labels.map((label,index) => [label,index===0 ? 1 : 0])),
}])));
assert(validated.ok);
const success: ReaderValueScoringOutcome={ok:true,answers:validated.value,execution:{
  requestId:'fixture-request',resolvedModel:'fixture-model',provider:'fixture',latencyMs:10,
  inputTokens:null,outputTokens:null,costUsd:null,usageUnknown:true,
}};

async function main() {
  const fixture=await assessmentPostgresFixture();
  const {setup,runtime,client}=fixture;
  const store=new PrismaReaderValueAssessmentStore(client);
  try {
    const {input,feedId}=await seedAssessmentSource(setup);
    const duplicates=await Promise.all([store.ensure(randomUUID(),input),store.ensure(randomUUID(),input)]);
    assert(duplicates[0]); assert.equal(duplicates[0].id,duplicates[1]?.id,'exact-key insert must dedupe');
    const id=duplicates[0].id;
    const claims=await Promise.all([store.claim(input,input.modelConfigVersion,randomUUID(),false),
      store.claim(input,input.modelConfigVersion,randomUUID(),false)]);
    assert.equal(claims.filter(Boolean).length,1,'only one concurrent lease');
    const claim=claims.find(Boolean)!;
    assert(await store.authorizeDispatch(claim,false));
    assert.equal(await store.authorizeDispatch(claim,false),false,'one send authorization per reservation');
    assert.equal(await store.complete({...claim,leaseToken:randomUUID()},success),false,'wrong lease cannot write');
    assert(await store.complete(claim,success));
    assert.equal(await store.complete(claim,success),false,'success cannot be overwritten');
    const persisted=await store.findExact(input,id);
    assert.equal(persisted?.state,'assessed'); assert.equal(persisted?.costUsd,null);
    assert.equal(persisted?.usageUnknown,true);
    await assert.rejects(setup.query("UPDATE reader_value_assessments SET usefulness='important' WHERE id=$1",[id]),{code:'23514'});
    await assert.rejects(setup.query("UPDATE reader_value_assessments SET request_body='changed' WHERE id=$1",[id]),{code:'23514'});

    const ref={assessmentId:id,feedItemId:feedId,sourceSnapshotSha256:input.sourceSnapshotSha256,inputSha256:input.inputSha256};
    assert.equal((await store.read(input,input.interestId,[ref]))[0]?.status,'available');
    assert.equal((await store.read(input,randomUUID(),[ref]))[0]?.status,'unavailable');
    assert.equal((await store.read(input,input.interestId,[{...ref,inputSha256:'0'.repeat(64)}]))[0]?.status,'stale');
    const other=await seedAssessmentSource(setup);
    assert.equal(await store.findExact(other.input,id),null,'tenant isolation is not just read mapping');
    const connection=await runtime.connect();
    try {
      await connection.query('BEGIN');
      await connection.query("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true)",
        [other.input.tenantId,other.input.workspaceId]);
      assert.equal((await connection.query('SELECT id FROM reader_value_assessments WHERE id=$1',[id])).rowCount,0,'RLS filters raw SQL');
      await connection.query('ROLLBACK');
    } finally {connection.release();}

    // Duplicate FeedItems share source/interest work, another interest never does.
    const duplicateFeed=randomUUID();
    await setup.query(`INSERT INTO feed_items SELECT $2::uuid,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,
      $2::text,canonical_url,title,body_preview,author_handle,published_at,observed_at,provider_metadata,status,created_at,updated_at
      FROM feed_items WHERE id=$1`,[feedId,duplicateFeed]);
    assert.equal((await store.read(input,input.interestId,[{...ref,feedItemId:duplicateFeed}]))[0]?.status,'available');
    assert.equal((await store.ensure(randomUUID(),input))?.id,id);
    const secondInterest=randomUUID(),secondBinding=randomUUID(),secondFeed=randomUUID();
    await setup.query(`INSERT INTO interests SELECT $2::uuid,tenant_id,workspace_id,'second','Testing methods',status,created_at,updated_at,deleted_at
      FROM interests WHERE id=$1`,[input.interestId,secondInterest]);
    await setup.query(`INSERT INTO source_bindings SELECT $2::uuid,tenant_id,workspace_id,$3::uuid,source_catalog_entry_id,
      capability_profile_version,status,config,cursor_reset_requested_at,created_at,updated_at,deleted_at
      FROM source_bindings WHERE id=(SELECT source_binding_id FROM feed_items WHERE id=$1)`,[feedId,secondBinding,secondInterest]);
    await setup.query(`INSERT INTO feed_items SELECT $2::uuid,tenant_id,workspace_id,$3::uuid,source_item_id,$4::uuid,provider_key,
      $2::text,canonical_url,title,body_preview,author_handle,published_at,observed_at,provider_metadata,status,created_at,updated_at
      FROM feed_items WHERE id=$1`,[feedId,secondFeed,secondInterest,secondBinding]);
    const second=await store.ensure(randomUUID(),{...input,interestId:secondInterest});
    assert(second); assert.notEqual(second.id,id);
    await assert.rejects(setup.query('UPDATE reader_value_assessments SET interest_id=$1 WHERE id=$2',[other.input.interestId,second.id]),{code:'23514'});

    await leaseExhaustion(store,setup,other.input);
    const lost=await seedAssessmentSource(setup);
    const pending=await store.ensure(randomUUID(),lost.input); assert(pending);
    const lostClaim=await store.claim(lost.input,lost.input.modelConfigVersion,randomUUID(),false); assert(lostClaim);
    assert(await store.authorizeDispatch(lostClaim,false));
    client.loseNextCommitAcknowledgement=true;
    await assert.rejects(store.complete(lostClaim,success),/Fixture lost commit acknowledgement/);
    assert.equal((await store.findExact(lost.input,pending.id))?.state,'assessed','lost ACK rereads committed exact result');
    assert.equal(await store.claim(lost.input,lost.input.modelConfigVersion,randomUUID(),false),null,'lost ACK cannot reserve another HTTP dispatch');
    await assert.rejects(setup.query(`INSERT INTO reader_value_assessments SELECT
      (jsonb_populate_record(NULL::reader_value_assessments,to_jsonb(a)||jsonb_build_object('id',$2::uuid,'interest_id',$3::uuid))).*
      FROM reader_value_assessments a WHERE a.id=$1`,[id,randomUUID(),other.input.interestId]),{code:'23503'});
    await retentionChecks(store,setup);
    await checkReaderValuePhysicalDeletion(fixture,store);
    await checkReaderValueIdentityAccounting(fixture);
    await checkReaderValueInventory(fixture);
    await checkReaderValueReferences(fixture,success);
    await checkReaderValueTerminalInputs(fixture,success);
    await checkReaderValuePinRaces(fixture);
    console.log('Reader value PostgreSQL gate OK (partial baseline/RLS/CP1 migration fixture; production Prisma connection path, not full migration-chain certification): exact reuse, interests/RLS, concurrent claims, stale leases, immutability, three reservations, retention/pins/holds/tombstones');
  } finally { await fixture.close(); }
}

async function leaseExhaustion(store: PrismaReaderValueAssessmentStore, db: Awaited<ReturnType<typeof assessmentPostgresFixture>>['setup'],
  input: ReaderValuePreparedInput) {
  const row=await store.ensure(randomUUID(),input); assert(row);
  let stale: ReaderValueAssessment | null=null;
  for (let ordinal=1;ordinal<=3;ordinal++) {
    const claim=await store.claim(input,input.modelConfigVersion,randomUUID(),false); assert(claim);
    assert.equal(claim.attempts,ordinal);
    if (stale) assert.equal(await store.complete(stale,success),false,'sent response from reclaimed lease cannot complete');
    assert(await store.authorizeDispatch(claim,false),'late-response fixture must first dispatch its reservation');
    stale=claim;
    await db.query("UPDATE reader_value_assessments SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[claim.id]);
    assert.equal(await store.complete(claim,success),false);
    assert.equal(await store.recoverExpiredLeases(input),1);
    const recovered=await store.findExact(input,claim.id); assert(recovered);
    assert.equal(recovered.attempts,ordinal);
    assert.equal(recovered.state,ordinal<3 ? 'retryable_failed' : 'permanent_failed');
    if (ordinal<3) {
      await db.query("UPDATE reader_value_assessments SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",[claim.id]);
    }
  }
  await assert.rejects(db.query(
    "UPDATE reader_value_assessments SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [row.id],
  ),{code:'23514'});
  assert.equal(await store.claim(input,input.modelConfigVersion,randomUUID(),false),null);
  assert.equal(await store.complete(stale!,success),false);
  assert.equal((await store.findExact(input,row.id))?.state,'permanent_failed');
  assert.equal((await store.findExact(input,row.id))?.usageUnknown,true);
  assert.equal((await store.ensure(randomUUID(),input))?.attempts,3,'discovery never resets exhausted work');
}

async function retentionChecks(store: PrismaReaderValueAssessmentStore, db: Awaited<ReturnType<typeof assessmentPostgresFixture>>['setup']) {
  const expired=await seedAssessmentSource(db,181);
  assert.equal(await store.ensure(randomUUID(),expired.input),null,'expired source cannot recreate paid work');
  const fixture=await seedAssessmentSource(db);
  await db.query("UPDATE source_items SET created_at=clock_timestamp()-interval '180 days'+interval '3 seconds' WHERE id=$1",[fixture.input.sourceItemId]);
  const row=await store.ensure(randomUUID(),fixture.input); assert(row);
  const job=await seedAssessmentJob(db,fixture.input);
  const refs=[{assessmentId:row.id,feedItemId:fixture.feedId,sourceSnapshotSha256:fixture.input.sourceSnapshotSha256,inputSha256:fixture.input.inputSha256}];
  assert(await store.pin(fixture.input,fixture.input.interestId,job,refs));
  await new Promise((resolve)=>setTimeout(resolve,3100));
  assert.equal((await store.cleanup(fixture.input,policy)).deferredActiveJob,1,'deadline/age never removes an active pin');
  assert.equal((await store.read(fixture.input,fixture.input.interestId,refs))[0]?.status,'available','active pin retains exact expired input');
  assert.equal((await store.cleanup(fixture.input,{...policy,retentionHoldWorkspaceIds:[fixture.input.workspaceId]})).deferredHold,1);
  assert.equal((await store.cleanup(fixture.input,{...policy,retentionHoldWorkspaceIds:null})).deferredUnknownPolicy,1);
  assert.equal((await store.cleanup(fixture.input,{...policy,retentionHoldWorkspaceIds:['invalid']})).deferredUnknownPolicy,1);
  await db.query("UPDATE reader_summary_jobs SET status='FAILED',failed_at=clock_timestamp() WHERE id=$1",[job]);
  assert.equal(await store.findExact(fixture.input,row.id),null,'expired unpinned input is unavailable before physical purge');
  assert.equal((await store.cleanup(fixture.input,policy)).deleted,1);
  assert.equal(await store.pin(fixture.input,fixture.input.interestId,job,refs),false,'purged input cannot become a dangling manifest');
  assert.equal(await store.ensure(randomUUID(),fixture.input),null);
  const tombstone=await seedAssessmentSource(db);
  const retained=await store.ensure(randomUUID(),tombstone.input); assert(retained);
  const activeJob=await seedAssessmentJob(db,tombstone.input);
  assert(await store.pin(tombstone.input,tombstone.input.interestId,activeJob,[{
    assessmentId:retained.id,feedItemId:tombstone.feedId,sourceSnapshotSha256:tombstone.input.sourceSnapshotSha256,inputSha256:tombstone.input.inputSha256,
  }]));
  await db.query("UPDATE feed_items SET status='TOMBSTONED' WHERE id=$1",[tombstone.feedId]);
  assert.equal(await store.findExact(tombstone.input,retained.id),null);
  assert.equal(await store.claim(tombstone.input,tombstone.input.modelConfigVersion,randomUUID(),false),null);
  assert.equal((await store.cleanup(tombstone.input,policy)).deleted,1);
  const terminal=await db.query('SELECT status,terminal_failure_code FROM reader_summary_jobs WHERE id=$1',[activeJob]);
  assert.equal(terminal.rows[0].status,'FAILED');
  assert.equal(terminal.rows[0].terminal_failure_code,'scope_changed');
  await assert.rejects(db.query("UPDATE reader_summary_jobs SET status='RUNNING' WHERE id=$1",[activeJob]),{code:'23514'});
}

void main().catch((error: unknown) => { console.error(error); process.exitCode=1; });
