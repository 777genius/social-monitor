import { assessmentClaim } from '../../application/use-cases/assess-reader-value-batch.spec-support';
import { ReaderValueInventoryTimeCeilingExceeded } from
  '../../application/contracts/reader-value-inventory';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from './assessment-sql';
import { PrismaReaderValueAssessmentStore } from './prisma-reader-value-assessment-store';

describe('PrismaReaderValueAssessmentStore dispatch authorization', () => {
  // Regression: a weekly inventory with more than 1000 FeedItem bindings must
  // reach scoped pin validation instead of hitting the old hard ceiling.
  it('accepts a bounded 1001-reference pin attempt with a 120-second transaction', async () => {
    const claim = dispatchClaim();
    const jobId = '00000000-0000-4000-8000-000000000005';
    const queries: string[] = [];
    let timeout = 0;
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>(query: string) => {
        queries.push(query);
        if (query.includes('jsonb_to_recordset')) return [] as T;
        if (query.includes('FROM reader_summary_jobs')) return [{ id: jobId }] as T;
        if (query.includes('ORDER BY a.id FOR UPDATE OF a')) {
          return [{ id: claim.id }] as T;
        }
        return [] as T;
      },
      $executeRawUnsafe: async () => 0,
    };
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async (operation, options) => {
        timeout = options.timeout;
        return operation(transaction);
      } };
    const references = Array.from({ length: 1001 }, () => ({
      assessmentId: claim.id, feedItemId: claim.input.sourceItemId,
      sourceSnapshotSha256: claim.input.sourceSnapshotSha256,
      inputSha256: claim.input.inputSha256,
    }));
    const result = await new PrismaReaderValueAssessmentStore(client).pin(
      claim.input, claim.input.interestId, jobId, references);
    expect(result).toBe(false);
    expect(queries.some((query) => query.includes('jsonb_to_recordset'))).toBe(true);
    expect(timeout).toBe(120_000);
  });

  // Regression: Prisma can report a timed-out weekly pin as an expired
  // transaction or a nested PostgreSQL statement cancellation.
  it.each([
    { code: 'P2028' },
    { code: 'P2010', meta: { driverAdapterError: {
      cause: { originalCode: '57014' } } } },
  ])('classifies a bounded pin timeout as preparation over budget', async (failure) => {
    const claim = dispatchClaim();
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>() => [] as T,
      $executeRawUnsafe: async () => 0,
    };
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async () => { throw failure; } };

    await expect(new PrismaReaderValueAssessmentStore(client).pin(
      claim.input, claim.input.interestId, claim.id, [],
    )).rejects.toBeInstanceOf(ReaderValueInventoryTimeCeilingExceeded);
  });

  // Regression: a visible FeedItem moved to another binding must not satisfy
  // a frozen assessment read merely because interest and source still match.
  it('requires the frozen source binding in a scoped assessment read', async () => {
    const claim = dispatchClaim();
    let query = '';
    let encodedReferences = '';
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>(sql: string, ...values: unknown[]) => {
        query = sql;
        encodedReferences = String(values[3]);
        return [] as T;
      },
      $executeRawUnsafe: async () => 0,
    };
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async (operation) => operation(transaction) };

    const reads = await new PrismaReaderValueAssessmentStore(client).read(
      claim.input, claim.input.interestId, [{ assessmentId: claim.id,
        feedItemId: claim.input.sourceItemId,
        sourceBindingId: '00000000-0000-4000-8000-000000000006',
        sourceSnapshotSha256: claim.input.sourceSnapshotSha256,
        inputSha256: claim.input.inputSha256 }]);

    expect(reads).toEqual([{ status: 'unavailable', assessmentId: claim.id }]);
    expect(query).toContain('f.source_binding_id=r."sourceBindingId"');
    expect(encodedReferences).toContain('"sourceBindingId"');
  });

  it('claims with read committed so parallel SKIP LOCKED workers do not serialize the same candidate scan', async () => {
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>() => [] as T,
      $executeRawUnsafe: async () => 0,
    };
    const isolationLevels: string[] = [];
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async (operation, options) => {
        isolationLevels.push(options.isolationLevel);
        return operation(transaction);
      } };
    const store = new PrismaReaderValueAssessmentStore(client);
    const scope = dispatchClaim().input;
    await store.claim(scope, scope.modelConfigVersion, dispatchClaim().leaseToken, false);
    await store.backlogAgeMs(scope, scope.modelConfigVersion, false);
    expect(isolationLevels).toEqual(['ReadCommitted', 'Serializable']);
  });

  it('locks a live pinned summary job before recording legacy-drain sentAt', async () => {
    const queries: string[] = [];
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>() => [] as T,
      $executeRawUnsafe: async (query) => {
        queries.push(query);
        return query.includes('UPDATE reader_value_assessments') ? 1 : 0;
      },
    };
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async (operation) => operation(transaction) };

    await expect(new PrismaReaderValueAssessmentStore(client).authorizeDispatch(
      dispatchClaim() as never, true,
    )).resolves.toBe(true);

    const authorization = queries.find((query) => query.includes('UPDATE reader_value_assessments'));
    expect(authorization).toContain('pinned.pinned_job_ids');
    expect(authorization).toContain("j.status IN ('REQUESTED','RUNNING')");
    expect(authorization).toContain('FOR KEY SHARE OF j');
    expect(authorization).toContain('EXISTS (SELECT 1 FROM active_pin)');
  });

  it('keeps ordinary discovery on the current-source authorization path', async () => {
    const queries: string[] = [];
    const transaction: AssessmentSqlTransaction = {
      $queryRawUnsafe: async <T>() => [] as T,
      $executeRawUnsafe: async (query) => {
        queries.push(query);
        return query.includes('UPDATE reader_value_assessments') ? 1 : 0;
      },
    };
    const client: AssessmentSqlClient = { ...transaction,
      $transaction: async (operation) => operation(transaction) };

    await new PrismaReaderValueAssessmentStore(client).authorizeDispatch(
      dispatchClaim() as never, false,
    );

    expect(queries.find((query) => query.includes('UPDATE reader_value_assessments')))
      .not.toContain('active_pin');
  });
});

const dispatchClaim = () => {
  const claim = assessmentClaim();
  return { ...claim,
    id: "00000000-0000-4000-8000-000000000003",
    leaseToken: "00000000-0000-4000-8000-000000000004",
    input: { ...claim.input,
      tenantId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
    },
  };
};
