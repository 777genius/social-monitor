import { runWithSystemDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { ReaderValueDiscoveryScopes, ReaderValueMaintenanceScopes } from '../../application/contracts/reader-value-maintenance-scopes';
import type { ReaderValueDiscoveryScope } from '../../application/contracts/reader-value-assessment-store';
import type { AssessmentSqlClient } from './assessment-sql';

export class PrismaReaderValueMaintenanceScopes implements ReaderValueMaintenanceScopes, ReaderValueDiscoveryScopes {
  constructor(private readonly client: AssessmentSqlClient) {}
  nextDiscoverable(after: ReaderValueDiscoveryScope | undefined, backfillFrom: string,
    limit: number): Promise<readonly ReaderValueDiscoveryScope[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error('Reader value discovery scope page limit is 25');
    }
    return runWithSystemDatabaseAccess('reader-value live discovery scope enumeration', () =>
      withPrismaWriteRetry(() => this.client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
        return tx.$queryRawUnsafe<ReaderValueDiscoveryScope[]>(`SELECT
          i.tenant_id::text AS "tenantId",i.workspace_id::text AS "workspaceId",
          i.id::text AS "interestId"
          FROM interests i
          WHERE i.status='ENABLED' AND i.deleted_at IS NULL
          AND ($1::uuid IS NULL OR (i.tenant_id,i.workspace_id,i.id)>
            ($1::uuid,$2::uuid,$3::uuid))
          AND EXISTS (SELECT 1 FROM feed_items f
            JOIN source_bindings b ON b.tenant_id=f.tenant_id
              AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
              AND b.interest_id=f.interest_id
            WHERE f.tenant_id=i.tenant_id AND f.workspace_id=i.workspace_id
              AND f.interest_id=i.id AND f.status='VISIBLE'
              AND b.status='ENABLED' AND b.deleted_at IS NULL
              AND f.published_at >= $4::timestamptz)
          ORDER BY i.tenant_id,i.workspace_id,i.id LIMIT $5`,
        after?.tenantId ?? null, after?.workspaceId ?? null, after?.interestId ?? null,
        backfillFrom, limit);
      }, { isolationLevel: 'Serializable', timeout: 10_000, maxWait: 5_000 })));
  }
  next(after: ReaderValueDiscoveryScope | undefined): Promise<ReaderValueDiscoveryScope | null> {
    return runWithSystemDatabaseAccess('reader-value assessment maintenance scope enumeration', () =>
      withPrismaWriteRetry(() => this.client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
        const rows = await tx.$queryRawUnsafe<ReaderValueDiscoveryScope[]>(`SELECT DISTINCT
          tenant_id::text AS "tenantId",workspace_id::text AS "workspaceId",
          interest_id::text AS "interestId"
          FROM reader_value_assessments
          WHERE ($1::uuid IS NULL OR (tenant_id,workspace_id,interest_id)>
            ($1::uuid,$2::uuid,$3::uuid))
          ORDER BY "tenantId","workspaceId","interestId" LIMIT 1`,
        after?.tenantId ?? null,after?.workspaceId ?? null,after?.interestId ?? null);
        return rows[0] ?? null;
      }, { isolationLevel: 'Serializable', timeout: 10_000, maxWait: 5_000 })));
  }
}
