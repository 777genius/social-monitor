import { runWithSystemDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { ReaderValueMaintenanceScopes } from '../../application/contracts/reader-value-maintenance-scopes';
import type { ReaderValueDiscoveryScope } from '../../application/contracts/reader-value-assessment-store';
import type { AssessmentSqlClient } from './assessment-sql';

export class PrismaReaderValueMaintenanceScopes implements ReaderValueMaintenanceScopes {
  constructor(private readonly client: AssessmentSqlClient) {}
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
