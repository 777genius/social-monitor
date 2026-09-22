import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { assessmentPostgresFixture } from './reader-value-postgres-fixture';
import { seedAssessmentJob, seedAssessmentSource } from './reader-value-postgres-fixture';
import { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from '../../libs/relevance/infrastructure/reader-value/assessment-sql';

const policy = {version:'reader-value-retention.v1',retentionHoldWorkspaceIds:[],eraseRevokedScopes:true} as const;
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve=done; });
  return {promise,resolve};
}

/** Pause a real transaction after its writes, with all row locks still held. */
class ControlledCommitClient implements AssessmentSqlClient {
  readonly written = signal();
  readonly release = signal();
  pid: number | undefined;
  private first = true;
  constructor(private readonly client: AssessmentSqlClient, private readonly hold: boolean) {}
  $queryRawUnsafe<T>(): Promise<T> { throw new Error('Scoped transaction required'); }
  $executeRawUnsafe(): Promise<number> { throw new Error('Scoped transaction required'); }
  $transaction<T>(operation: (tx: AssessmentSqlTransaction) => Promise<T>,
    options: {isolationLevel:'Serializable';maxWait:number;timeout:number}): Promise<T> {
    return this.client.$transaction(async (tx) => {
      const pause = this.first && this.hold; this.first=false;
      this.pid = (await tx.$queryRawUnsafe<{pid:number}[]>('SELECT pg_backend_pid() AS pid'))[0]!.pid;
      const value = await operation(tx);
      if (pause) { this.written.resolve(); await this.release.promise; }
      return value;
    },options);
  }
}

export async function checkReaderValuePinRaces(fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>) {
  const store = new PrismaReaderValueAssessmentStore(fixture.client);
  const seed = async () => {
    const source = await seedAssessmentSource(fixture.setup);
    await fixture.setup.query("UPDATE source_items SET created_at=clock_timestamp()-interval '180 days'+interval '4 seconds' WHERE id=$1",
      [source.input.sourceItemId]);
    const row = await store.ensure(randomUUID(),source.input); assert(row);
    const job = await seedAssessmentJob(fixture.setup,source.input);
    const refs = [{assessmentId:row.id,feedItemId:source.feedId,
      sourceSnapshotSha256:source.input.sourceSnapshotSha256,inputSha256:source.input.inputSha256}];
    return {...source,row,job,refs};
  };
  const waitForExpiry = async (id: string) => {
    const result = await fixture.setup.query<{ms:number}>(`SELECT GREATEST(0,EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))*1000)::float8 AS ms
      FROM reader_value_assessments WHERE id=$1`,[id]);
    await new Promise((resolve) => setTimeout(resolve,result.rows[0]!.ms+30));
  };
  const pinFirst = await seed();
  const pinClient = new ControlledCommitClient(fixture.client,true);
  const pendingPin = new PrismaReaderValueAssessmentStore(pinClient).pin(pinFirst.input,pinFirst.input.interestId,pinFirst.job,pinFirst.refs);
  try {
    await Promise.race([pinClient.written.promise,pendingPin.then(() => { throw new Error('Pin did not reach controlled commit'); })]);
    await waitForExpiry(pinFirst.row.id);
    assert.equal((await store.cleanup(pinFirst.input,policy)).deleted,0,'purge skips the uncommitted pin lock');
  } finally { pinClient.release.resolve(); }
  assert(await pendingPin,'pin authorized before expiry commits first');
  assert.equal((await store.cleanup(pinFirst.input,policy)).deferredActiveJob,1,'pin-first retains expired input');
  assert.equal((await store.read(pinFirst.input,pinFirst.input.interestId,pinFirst.refs))[0]?.status,'available');

  const dispatchPin = await seed();
  assert(await store.pin(dispatchPin.input,dispatchPin.input.interestId,dispatchPin.job,dispatchPin.refs));
  const claimedPinned = await store.claim(dispatchPin.input,dispatchPin.input.modelConfigVersion,randomUUID(),true);
  assert(claimedPinned,'legacy drain claims durable active pins');
  await fixture.setup.query(`UPDATE reader_summary_jobs SET status='FAILED',failed_at=clock_timestamp(),
    terminal_failure_code='operator_cancelled' WHERE id=$1`,[dispatchPin.job]);
  assert.equal(await store.authorizeDispatch(claimedPinned,true),false,
    'a cancelled pinned job cannot record sentAt or authorize a paid legacy-drain request');

  const purgeFirst = await seed();
  await waitForExpiry(purgeFirst.row.id);
  const purgeClient = new ControlledCommitClient(fixture.client,true);
  const waitingPinClient = new ControlledCommitClient(fixture.client,false);
  const pendingPurge = new PrismaReaderValueAssessmentStore(purgeClient).cleanup(purgeFirst.input,policy);
  await Promise.race([purgeClient.written.promise,pendingPurge.then(() => { throw new Error('Purge did not reach controlled commit'); })]);
  const waitingPin = new PrismaReaderValueAssessmentStore(waitingPinClient).pin(purgeFirst.input,purgeFirst.input.interestId,purgeFirst.job,purgeFirst.refs);
  try {
    let blocked = false;
    for (let poll=0;poll<60;poll++) {
      if (waitingPinClient.pid !== undefined) {
        const result = await fixture.setup.query<{blocked:boolean}>(
          'SELECT $2::integer=ANY(pg_blocking_pids($1::integer)) AS blocked',[waitingPinClient.pid,purgeClient.pid]);
        if (result.rows[0]?.blocked) { blocked=true; break; }
      }
      await new Promise((resolve) => setTimeout(resolve,20));
    }
    assert(blocked,'prove pin is blocked on the live purge transaction before allowing its commit');
  } finally { purgeClient.release.resolve(); }
  assert.equal((await pendingPurge).deleted,1);
  assert.equal(await waitingPin,false,'purge-first rejects pin after lock release/retry');
  assert.equal(await store.findExact(purgeFirst.input,purgeFirst.row.id),null);
}
