import { assessmentClaim } from '../../application/use-cases/assess-reader-value-batch.spec-support';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from './assessment-sql';
import { PrismaReaderValueAssessmentStore } from './prisma-reader-value-assessment-store';

describe('PrismaReaderValueAssessmentStore dispatch authorization', () => {
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
