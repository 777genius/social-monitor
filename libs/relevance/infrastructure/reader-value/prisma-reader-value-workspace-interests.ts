import type { ReaderValueWorkspaceInterests } from
  "../../application/contracts/reader-value-workspace-interests";
import { assessmentReadSnapshot, type AssessmentSqlClient } from "./assessment-sql";

export class PrismaReaderValueWorkspaceInterests implements ReaderValueWorkspaceInterests {
  constructor(private readonly client: AssessmentSqlClient) {}

  listEnabled(scope: { readonly tenantId: string; readonly workspaceId: string },
    limit: number): Promise<readonly { readonly interestId: string;
      readonly query: string }[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Workspace interest read limit is invalid");
    }
    return assessmentReadSnapshot(this.client, scope, async (tx) => {
      const rows = await tx.$queryRawUnsafe<readonly {
        readonly interestId: string; readonly query: string }[]>(
        `SELECT i.id::text AS "interestId", i.query FROM interests i
         JOIN workspaces w ON w.tenant_id=i.tenant_id AND w.id=i.workspace_id
         JOIN tenants t ON t.id=w.tenant_id
         WHERE i.tenant_id=$1::uuid AND i.workspace_id=$2::uuid
           AND i.status='ENABLED' AND i.deleted_at IS NULL
           AND w.deleted_at IS NULL AND t.deleted_at IS NULL
         ORDER BY i.id LIMIT $3`, scope.tenantId, scope.workspaceId,
        limit + 1);
      return rows;
    });
  }
}
