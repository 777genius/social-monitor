import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaReaderValueAssessmentStore } from '../../libs/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { seedAssessmentJob, seedAssessmentSource, type assessmentPostgresFixture } from './reader-value-postgres-fixture';

export async function checkReaderValuePhysicalDeletion(
  fixture: Awaited<ReturnType<typeof assessmentPostgresFixture>>, store: PrismaReaderValueAssessmentStore,
) {
  const { setup, runtime } = fixture;
  const other = await seedAssessmentSource(setup);
  const otherJob = await seedAssessmentJob(setup, other.input);
  for (const target of ['source', 'interest', 'assessment'] as const) {
    for (const status of ['REQUESTED', 'RUNNING'] as const) {
      const { input, feedId } = await seedAssessmentSource(setup);
      const row = await store.ensure(randomUUID(), input);
      assert(row);
      const jobId = await seedAssessmentJob(setup, input);
      assert(await store.pin(input, input.interestId, jobId, [{ assessmentId: row.id, feedItemId: feedId,
        sourceSnapshotSha256: input.sourceSnapshotSha256, inputSha256: input.inputSha256 }]));
      // A corrupt foreign pin must never grant the trigger cross-tenant authority.
      await setup.query('UPDATE reader_value_assessments SET pinned_job_ids=array_append(pinned_job_ids,$2::uuid) WHERE id=$1', [row.id, otherJob]);
      await setup.query('UPDATE reader_summary_jobs SET status=$2 WHERE id=$1', [jobId, status]);
      const table = { source: 'source_items', interest: 'interests', assessment: 'reader_value_assessments' }[target];
      const id = { source: input.sourceItemId, interest: input.interestId, assessment: row.id }[target];
      // Rollback must restore both the input and active job: fencing and deletion are atomic.
      const connection = await setup.connect();
      try {
        await connection.query('BEGIN');
        // Existing feed->source RESTRICT requires removing the projection first.
        if (target === 'source') await connection.query('DELETE FROM feed_items WHERE id=$1', [feedId]);
        await connection.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
        const fenced = await connection.query('SELECT status,terminal_failure_code FROM reader_summary_jobs WHERE id=$1', [jobId]);
        assert.deepEqual(fenced.rows, [{ status: 'FAILED', terminal_failure_code: 'scope_changed' }]);
        await connection.query('ROLLBACK');
      } finally { connection.release(); }
      assert.equal((await setup.query('SELECT status FROM reader_summary_jobs WHERE id=$1', [jobId])).rows[0].status, status);
      assert.equal((await setup.query('SELECT id FROM reader_value_assessments WHERE id=$1', [row.id])).rowCount, 1);
      const scoped = await runtime.connect();
      try {
        await scoped.query('BEGIN');
        await scoped.query("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true)",
          [input.tenantId, input.workspaceId]);
        assert.equal((await scoped.query('DELETE FROM source_items WHERE id=$1', [other.input.sourceItemId])).rowCount, 0);
        if (target === 'source') await scoped.query('DELETE FROM feed_items WHERE id=$1', [feedId]);
        await scoped.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
        await scoped.query('COMMIT');
      } finally { scoped.release(); }
      assert.equal((await setup.query('SELECT status FROM reader_summary_jobs WHERE id=$1', [otherJob])).rows[0].status, 'REQUESTED');
      assert.equal((await setup.query('SELECT id FROM reader_value_assessments WHERE id=$1', [row.id])).rowCount, 0);
      const terminal = await setup.query('SELECT status,terminal_failure_code,failed_at FROM reader_summary_jobs WHERE id=$1', [jobId]);
      assert.equal(terminal.rows[0].status, 'FAILED');
      assert.equal(terminal.rows[0].terminal_failure_code, 'scope_changed');
      assert(terminal.rows[0].failed_at);
      await assert.rejects(setup.query("UPDATE reader_summary_jobs SET status='RUNNING' WHERE id=$1", [jobId]), { code: '23514' });
      await assert.rejects(setup.query('UPDATE reader_summary_jobs SET terminal_failure_code=NULL WHERE id=$1', [jobId]), { code: '23514' });
    }
  }
}
