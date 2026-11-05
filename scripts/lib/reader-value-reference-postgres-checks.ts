import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentJob, seedAssessmentSource } from './reader-value-postgres-fixture';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import type { ReaderValueScoringOutcome } from '../../libs/relevance/application/contracts/reader-value-assessment-store';

export async function checkReaderValueReferences(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>,
  success: ReaderValueScoringOutcome) {
  const { setup } = fixture;
  const { input, feedId, bindingId } = await seedAssessmentSource(setup);
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const row = await store.ensure(randomUUID(),input); assert(row);
  const claim = await store.claim(input,input.modelConfigVersion,randomUUID(),false); assert(claim);
  assert(await store.authorizeDispatch(claim,false));
  assert(await store.complete(claim,success));
  const activeBinding = randomUUID(), activeFeed = randomUUID();
  await setup.query(`INSERT INTO source_bindings SELECT $2::uuid,tenant_id,workspace_id,interest_id,source_catalog_entry_id,
    capability_profile_version,status,config,cursor_reset_requested_at,created_at,updated_at,deleted_at
    FROM source_bindings WHERE id=$1`,[bindingId,activeBinding]);
  await setup.query(`INSERT INTO feed_items SELECT $2::uuid,tenant_id,workspace_id,interest_id,source_item_id,$3::uuid,provider_key,
    $2::text,canonical_url,title,body_preview,author_handle,published_at,observed_at,provider_metadata,status,created_at,updated_at
    FROM feed_items WHERE id=$1`,[feedId,activeFeed,activeBinding]);
  const job = await seedAssessmentJob(setup,input);
  const ref = {assessmentId:row.id,feedItemId:feedId,sourceSnapshotSha256:input.sourceSnapshotSha256,inputSha256:input.inputSha256};
  const activeRef = {...ref,feedItemId:activeFeed};
  for (const revocation of ["status='PAUSED'", "status='ENABLED',deleted_at=clock_timestamp()"] ) {
    await setup.query(`UPDATE source_bindings SET ${revocation} WHERE id=$1`,[bindingId]);
    assert.equal((await store.read(input,input.interestId,[ref]))[0]?.status,'unavailable');
    assert.equal(await store.pin(input,input.interestId,job,[ref]),false,'a duplicate cannot authorize this revoked binding');
    assert.equal(await store.pin(input,input.interestId,job,[activeRef,ref]),false,'mixed batches fail closed');
    const read = (await store.read(input,input.interestId,[activeRef]))[0];
    assert(read?.status === 'available');
    assert.equal(read.assessment.state,'assessed');
    assert.equal(read.assessment.id,row.id,'immutable assessment reusable through independently authorized duplicate');
    assert(await store.pin(input,input.interestId,job,[activeRef]));
    assert.equal((await store.ensure(randomUUID(),input))?.id,row.id);
  }
  await setup.query("UPDATE source_bindings SET status='ENABLED',deleted_at=NULL WHERE id=$1",[bindingId]);
  const mismatchedCatalog = await setup.query<{id:string}>(`INSERT INTO source_catalog_entries
    (id,provider_key,display_name,acquisition_mode,readiness,updated_at)
    VALUES($1,'hn','fixture','pull','enabled_beta',clock_timestamp())
    ON CONFLICT (provider_key) DO UPDATE SET provider_key=EXCLUDED.provider_key RETURNING id`,[randomUUID()]);
  await setup.query('UPDATE source_bindings SET source_catalog_entry_id=$2 WHERE id=$1',[bindingId,mismatchedCatalog.rows[0]!.id]);
  assert.equal((await store.read(input,input.interestId,[ref]))[0]?.status,'unavailable','exact binding catalog must authorize feed provider');
  assert.equal(await store.pin(input,input.interestId,job,[ref]),false);
  assert.equal((await store.read(input,input.interestId,[activeRef]))[0]?.status,'available');
  await setup.query(`UPDATE source_bindings SET source_catalog_entry_id=(SELECT source_catalog_entry_id
    FROM source_bindings WHERE id=$2) WHERE id=$1`,[bindingId,activeBinding]);
  await setup.query("UPDATE feed_items SET provider_key='hn' WHERE id=$1",[feedId]);
  assert.equal((await store.read(input,input.interestId,[ref]))[0]?.status,'unavailable','exact feed provider must match source and catalog');
  assert.equal(await store.pin(input,input.interestId,job,[ref]),false);
  assert.equal((await store.read(input,input.interestId,[activeRef]))[0]?.status,'available');
}
