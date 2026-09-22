import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { ReaderValueScope } from '../../application/contracts/reader-value-assessment-store';

export interface AssessmentSqlTransaction {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}
export interface AssessmentSqlClient extends AssessmentSqlTransaction {
  $transaction<T>(operation: (transaction: AssessmentSqlTransaction) => Promise<T>, options: {
    readonly isolationLevel: 'Serializable'; readonly timeout: number; readonly maxWait: number;
  }): Promise<T>;
}

export function assessmentTransaction<T>(client: AssessmentSqlClient, scope: ReaderValueScope,
  operation: (transaction: AssessmentSqlTransaction) => Promise<T>): Promise<T> {
  return runWithTenantDatabaseAccess(scope, () => withPrismaWriteRetry(() => client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
    await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '2000ms'");
    return operation(transaction);
  }, { isolationLevel: 'Serializable', timeout: 10_000, maxWait: 5_000 })));
}

/** a is always the assessment row. No popularity, quality flags or semantic floors. */
export const liveAssessmentScope = `EXISTS (
  SELECT 1 FROM source_items s
  JOIN feed_items f ON f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id AND f.source_item_id=s.id
    AND f.provider_key=s.provider_key AND f.interest_id=a.interest_id AND f.status='VISIBLE'
  JOIN source_bindings b ON b.tenant_id=f.tenant_id AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
    AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL
  JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id AND c.provider_key=s.provider_key
  JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id AND i.id=f.interest_id
    AND i.status='ENABLED' AND i.deleted_at IS NULL
  JOIN workspaces w ON w.tenant_id=i.tenant_id AND w.id=i.workspace_id AND w.deleted_at IS NULL
  JOIN tenants t ON t.id=w.tenant_id AND t.deleted_at IS NULL
  WHERE s.id=a.source_item_id AND s.tenant_id=a.tenant_id AND s.workspace_id=a.workspace_id
    AND COALESCE(s.metadata->>'deleted','false') <> 'true' AND COALESCE(s.metadata->>'dead','false') <> 'true'
    AND COALESCE(s.metadata->>'banned','false') <> 'true'
    AND NOT EXISTS (SELECT 1 FROM feed_items revoked WHERE revoked.tenant_id=a.tenant_id
      AND revoked.workspace_id=a.workspace_id AND revoked.interest_id=a.interest_id
      AND revoked.source_item_id=a.source_item_id AND revoked.status='TOMBSTONED')
)`;

export const activeAssessmentPin = `EXISTS (SELECT 1 FROM reader_summary_jobs j
  WHERE j.tenant_id=a.tenant_id AND j.workspace_id=a.workspace_id AND j.id=ANY(a.pinned_job_ids)
  AND j.status IN ('REQUESTED','RUNNING'))`;

// row_to_json preserves PostgreSQL microseconds, unlike driver timestamp->Date conversion.
export const assessmentJson = 'row_to_json(a) AS row';
