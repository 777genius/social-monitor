import type { Pool } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { readLatestReaderSummaryArtifact } from "./reader-summary-quality-eval-support";

describe("readLatestReaderSummaryArtifact", () => {
  it("reads only the latest published artifact", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await readLatestReaderSummaryArtifact(
      pool,
      {
        tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
        workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      },
      "2026-07-09",
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("status = 'COMPLETED'");
  });
});
