import { assessmentClaim } from '../../application/use-cases/assess-reader-value-batch.spec-support';
import type { ReaderValueReference } from '../../application/contracts/reader-value-assessment-store';
import type { AssessmentRecord } from './assessment-record';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from './assessment-sql';
import { PrismaReaderValueAssessmentStore } from './prisma-reader-value-assessment-store';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const jobId = id(9999);
function fixture(options: { staleLast?: boolean; full?: boolean } = {}) {
  const input = { ...assessmentClaim().input, tenantId: id(500), workspaceId: id(501), interestId: id(502) };
  const references: ReaderValueReference[] = Array.from({ length: 201 }, (_, index) => ({
    assessmentId: id(201 - index), feedItemId: id(1000 + index),
    sourceSnapshotSha256: input.sourceSnapshotSha256,
    inputSha256: String(index).padStart(64, '0'),
  }));
  const events: { kind: string; ids: readonly string[] }[] = [];
  let transactions = 0;
  const record = (ref: ReaderValueReference): AssessmentRecord => ({
    id: ref.assessmentId, tenant_id: input.tenantId, workspace_id: input.workspaceId,
    interest_id: input.interestId, source_item_id: input.sourceItemId,
    source_revision_key: input.sourceRevisionKey, source_snapshot_sha256: input.sourceSnapshotSha256,
    interest_sha256: input.interestSha256, rubric_version: input.rubricVersion,
    rubric_sha256: input.rubricSha256, input_builder_version: input.inputBuilderVersion,
    model_config_version: input.modelConfigVersion, input_sha256: ref.inputSha256,
    request_sha256: input.requestSha256, requested_model: input.requestedModel,
    request_body: input.requestBody, input_snapshot: input.snapshot, state: 'pending',
    attempts: 0, lease_token: null, lease_until: null, assessed_at: null, result: null,
    error_code: null, usage_unknown: false, cost_usd: null,
  });
  const tx: AssessmentSqlTransaction = {
    $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) => {
      if (query.includes('SELECT id FROM reader_summary_jobs')) return [{ id: jobId }] as T;
      if (query.includes('FOR UPDATE OF a')) {
        const ids = values[3] as string[]; events.push({ kind: 'lock', ids });
        return ids.map(value => ({ id: value })) as T;
      }
      if (query.includes('cardinality(a.pinned_job_ids)')) {
        events.push({ kind: 'capacity', ids: values[2] as string[] });
        return (options.full ? [{ id: references[0]!.assessmentId }] : []) as T;
      }
      const refs = JSON.parse(String(values[3])) as ReaderValueReference[];
      events.push({ kind: 'read', ids: refs.map(ref => ref.assessmentId) });
      return refs.filter(ref => !(options.staleLast && ref.assessmentId === id(1)))
        .map(ref => ({ row: record(ref), feed_id: ref.feedItemId })) as T;
    },
    $executeRawUnsafe: async (query, ...values) => {
      if (query.includes('SET pinned_job_ids=ARRAY(')) events.push({ kind: 'prune', ids: values[2] as string[] });
      if (query.includes('SET pinned_job_ids=array_append')) events.push({ kind: 'append', ids: values[3] as string[] });
      return 0;
    },
  };
  const client: AssessmentSqlClient = { ...tx, $transaction: async (operation, config) => {
    transactions += 1;
    expect(config).toMatchObject({ isolationLevel: 'Serializable', timeout: 120_000 });
    return operation(tx);
  } };
  return { references, events, run: (refs = references) => new PrismaReaderValueAssessmentStore(client)
    .pin(input, input.interestId, jobId, refs), transactions: () => transactions };
}

describe('bounded atomic assessment pin statements', () => {
  it('locks all unique IDs first, prunes in bounded batches and validates every reference before appending', async () => {
    const f = fixture();
    expect(await f.run([...f.references, f.references[0]!])).toBe(true);
    expect(f.transactions()).toBe(1);
    const ids = f.references.map(ref => ref.assessmentId).sort();
    expect(f.events[0]).toEqual({ kind: 'lock', ids });
    for (const kind of ['prune', 'append']) {
      const batches = f.events.filter(event => event.kind === kind);
      expect(batches.map(batch => batch.ids.length)).toEqual([100, 100, 1]);
      expect(batches.flatMap(batch => batch.ids)).toEqual(ids);
    }
    expect(f.events.map(event => event.kind)).toEqual([
      'lock', 'prune', 'prune', 'prune', 'capacity', 'read', 'read', 'read', 'append', 'append', 'append',
    ]);
    expect(f.events.filter(event => event.kind === 'read').flatMap(event => event.ids)).toHaveLength(202);
  });

  it('never appends when the final reference batch is unavailable', async () => {
    const f = fixture({ staleLast: true });
    expect(await f.run()).toBe(false);
    expect(f.events.filter(event => event.kind === 'prune')).toHaveLength(3);
    expect(f.events.filter(event => event.kind === 'read')).toHaveLength(3);
    expect(f.events.some(event => event.kind === 'append')).toBe(false);
  });

  it('checks capacity globally before reference reads or pin appends', async () => {
    const f = fixture({ full: true });
    expect(await f.run()).toBe(false);
    expect(f.events.at(-1)?.kind).toBe('capacity');
  });

  it('accepts an empty reference set without trigger-bearing updates', async () => {
    const f = fixture();
    expect(await f.run([])).toBe(true);
    expect(f.events.map(event => event.kind)).toEqual(['lock', 'capacity']);
  });
});
