import type { PoolClient } from "pg";

export const readerSummaryPublicationFixtureScope = {
  tenantId: "00000000-0000-7000-8000-000000000001",
  workspaceId: "00000000-0000-7000-8000-000000000002",
} as const;

const fixtureTimestamp = "2026-06-01T00:00:00.000Z";
const tenantName = "Reader summary publication fixture tenant";
const tenantSlug = "reader-summary-publication-fixture";
const workspaceName = "Reader summary publication fixture workspace";
const workspaceSlug = "weekly-publication-evidence";

export const provisionReaderSummaryPublicationFixtureScope = async (
  auditor: Pick<PoolClient, "query">,
): Promise<void> => {
  const { tenantId, workspaceId } = readerSummaryPublicationFixtureScope;
  await auditor.query("BEGIN");
  try {
    await auditor.query(
      "SELECT pg_advisory_xact_lock($1::integer, $2::integer)",
      [20260725, 130000],
    );
    await auditor.query(
      `INSERT INTO tenants (
         id, slug, name, created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [tenantId, tenantSlug, tenantName, fixtureTimestamp],
    );
    await auditor.query(
      `INSERT INTO workspaces (
         id, tenant_id, slug, name, created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $5::timestamptz, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId, tenantId, workspaceSlug, workspaceName, fixtureTimestamp],
    );
    const binding = await auditor.query<{
      readonly tenant_matches: boolean;
      readonly workspace_matches: boolean;
    }>(
      `SELECT
         tenant.slug = $3
           AND tenant.name = $4
           AND tenant.created_at = $7::timestamptz
           AND tenant.updated_at = $7::timestamptz
           AND tenant.deleted_at IS NULL AS tenant_matches,
         workspace.tenant_id = $1
           AND workspace.slug = $5
           AND workspace.name = $6
           AND workspace.created_at = $7::timestamptz
           AND workspace.updated_at = $7::timestamptz
           AND workspace.deleted_at IS NULL AS workspace_matches
         FROM tenants AS tenant
         CROSS JOIN workspaces AS workspace
        WHERE tenant.id = $1
          AND workspace.id = $2
          FOR UPDATE OF tenant, workspace`,
      [
        tenantId,
        workspaceId,
        tenantSlug,
        tenantName,
        workspaceSlug,
        workspaceName,
        fixtureTimestamp,
      ],
    );
    if (
      binding.rows[0]?.tenant_matches !== true ||
      binding.rows[0]?.workspace_matches !== true
    ) {
      throw new Error(
        "reader summary publication fixture tenant/workspace binding diverged",
      );
    }
    await auditor.query("COMMIT");
  } catch (error: unknown) {
    await auditor.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};
