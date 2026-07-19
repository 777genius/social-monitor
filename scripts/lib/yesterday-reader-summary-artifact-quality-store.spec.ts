import type { Pool } from "pg";

import type { SelectedFeedItemProvenance } from "./reader-summary-artifact-coverage";
import { YesterdayReaderSummaryArtifactQualityStore } from "./yesterday-reader-summary-artifact-quality-store";

describe("YesterdayReaderSummaryArtifactQualityStore", () => {
  it("reads tenant-scoped DB and interest provenance for selected ids", async () => {
    const rows: readonly SelectedFeedItemProvenance[] = [
      {
        feedItemId: "00000000-0000-7000-8000-000000000101",
        tenantId: "00000000-0000-7000-8000-000000000201",
        workspaceId: "00000000-0000-7000-8000-000000000301",
        interestId: "00000000-0000-7000-8000-000000000401",
        interestTenantId: "00000000-0000-7000-8000-000000000201",
        interestWorkspaceId: "00000000-0000-7000-8000-000000000301",
        providerKey: "reddit",
      },
    ];
    const query = jest.fn().mockResolvedValue({ rows });
    const store = new YesterdayReaderSummaryArtifactQualityStore(
      { query } as unknown as Pool,
      "2026-07-18",
      "false-positive-needle",
    );

    await expect(
      store.readSelectedFeedItemProvenance({
        tenantId: rows[0]!.tenantId,
        workspaceId: rows[0]!.workspaceId,
        feedItemIds: [rows[0]!.feedItemId],
      }),
    ).resolves.toEqual(rows);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('fi.tenant_id::text as "tenantId"');
    expect(sql).toContain('fi.workspace_id::text as "workspaceId"');
    expect(sql).toContain('fi.interest_id::text as "interestId"');
    expect(sql).toContain('i.tenant_id::text as "interestTenantId"');
    expect(sql).toContain('i.workspace_id::text as "interestWorkspaceId"');
    expect(sql).toContain("on i.id = fi.interest_id");
    expect(sql).toContain("and i.tenant_id = $1::uuid");
    expect(sql).toContain("and i.workspace_id = $2::uuid");
    expect(sql).toContain("where fi.tenant_id = $1::uuid");
    expect(sql).toContain("and fi.workspace_id = $2::uuid");
    expect(sql).toContain("and fi.id = any($3::uuid[])");
    expect(query.mock.calls[0]?.[1]).toEqual([
      rows[0]!.tenantId,
      rows[0]!.workspaceId,
      [rows[0]!.feedItemId],
    ]);
  });
});
