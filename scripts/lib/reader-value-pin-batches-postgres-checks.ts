import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentJob, seedAssessmentSource } from './reader-value-postgres-fixture';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import type { ReaderValueReference } from '../../libs/relevance/application/contracts/reader-value-assessment-store';
import { ReaderValueInventoryTimeCeilingExceeded } from '../../libs/relevance/application/contracts/reader-value-inventory';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from '../../libs/relevance/infrastructure/reader-value/assessment-sql';

/** Inject a real statement cancellation after one append batch, inside the real transaction. */
class PinBatchClient implements AssessmentSqlClient {
  transactions = 0;
  readonly pruneSizes: number[] = [];
  readonly appendSizes: number[] = [];
  completedAppends = 0;
  constructor(private readonly client: AssessmentSqlClient, private readonly cancel: boolean) {}
  $queryRawUnsafe<T>(): Promise<T> { throw new Error('Scoped transaction required'); }
  $executeRawUnsafe(): Promise<number> { throw new Error('Scoped transaction required'); }
  $transaction<T>(operation: (tx: AssessmentSqlTransaction) => Promise<T>,
    options: {isolationLevel:'Serializable'|'ReadCommitted';maxWait:number;timeout:number}): Promise<T> {
    this.transactions++;
    assert.equal(options.isolationLevel,'Serializable');
    return this.client.$transaction((tx) => operation({
      $queryRawUnsafe: <R>(sql: string,...values: unknown[]) => tx.$queryRawUnsafe<R>(sql,...values),
      $executeRawUnsafe: async (sql: string,...values: unknown[]) => {
        const append = sql.includes('SET pinned_job_ids=array_append');
        const prune = sql.includes('SET pinned_job_ids=ARRAY(');
        if (append || prune) {
          const ids = values[append ? 3 : 2] as readonly string[];
          assert(ids.length > 0 && ids.length <= 100,'every pin write is bounded');
          (append ? this.appendSizes : this.pruneSizes).push(ids.length);
        }
        if (append && this.cancel && this.appendSizes.length === 2) {
          assert.equal(this.completedAppends,1,'first batch completed before cancellation');
          await tx.$executeRawUnsafe("DO $$ BEGIN RAISE EXCEPTION 'synthetic pin cancellation' USING ERRCODE='57014'; END $$");
        }
        const count = await tx.$executeRawUnsafe(sql,...values);
        if (append) { assert.equal(count,values[3] instanceof Array ? values[3].length : -1); this.completedAppends++; }
        return count;
      },
    }),options);
  }
}

export async function checkReaderValuePinBatches(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>) {
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const source = await seedAssessmentSource(fixture.setup);
  const seed = await store.ensure(randomUUID(),source.input); assert(seed);
  const oldJob = await seedAssessmentJob(fixture.setup,source.input);
  const newJob = await seedAssessmentJob(fixture.setup,source.input);
  await fixture.setup.query("UPDATE reader_summary_jobs SET status='FAILED',failed_at=clock_timestamp() WHERE id=$1",[oldJob]);
  const refs: ReaderValueReference[] = [];
  for (let index=0;index<201;index++) {
    const id = randomUUID();
    const inputSha256 = createHash('sha256').update(`pin-batches:${id}`).digest('hex');
    await fixture.setup.query(`INSERT INTO reader_value_assessments SELECT
      (jsonb_populate_record(NULL::reader_value_assessments,to_jsonb(a)||jsonb_build_object(
        'id',$2::uuid,'input_sha256',$3::text,'pinned_job_ids',to_jsonb(ARRAY[$4::uuid])))).*
      FROM reader_value_assessments a WHERE id=$1`,[seed.id,id,inputSha256,oldJob]);
    refs.push({assessmentId:id,feedItemId:source.feedId,
      sourceSnapshotSha256:source.input.sourceSnapshotSha256,inputSha256});
  }
  const assertPins = async (job: string) => {
    const rows = await fixture.setup.query<{id:string;pinned_job_ids:string[]}>(
      'SELECT id,pinned_job_ids FROM reader_value_assessments WHERE id=ANY($1::uuid[])',
      [refs.map((ref) => ref.assessmentId)]);
    assert.equal(rows.rows.length,201);
    for (const row of rows.rows) assert.deepEqual(row.pinned_job_ids,[job]);
  };
  await assertPins(oldJob);
  const cancelled = new PinBatchClient(fixture.client,true);
  await assert.rejects(new PrismaReaderValueAssessmentStore(cancelled).pin(
    source.input,source.input.interestId,newJob,refs),ReaderValueInventoryTimeCeilingExceeded);
  assert.equal(cancelled.transactions,1,'all batches share one transaction');
  assert.deepEqual(cancelled.pruneSizes,[100,100,1]);
  assert.deepEqual(cancelled.appendSizes,[100,100]);
  await assertPins(oldJob); // Both successful pruning and the first append must roll back.
  const successful = new PinBatchClient(fixture.client,false);
  assert.equal(await new PrismaReaderValueAssessmentStore(successful).pin(
    source.input,source.input.interestId,newJob,refs),true);
  assert.equal(successful.transactions,1);
  assert.deepEqual(successful.pruneSizes,[100,100,1]);
  assert.deepEqual(successful.appendSizes,[100,100,1]);
  assert.equal(successful.completedAppends,3);
  await assertPins(newJob);
}
