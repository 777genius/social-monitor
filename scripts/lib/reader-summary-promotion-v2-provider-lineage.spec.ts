import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("historical Promotion V2 provider lineage contract", () => {
  it("binds feed, observation, rollup and snapshot providers to source authority", () => {
    const adapter = readFileSync(resolve(
      process.cwd(),
      "scripts/lib/reader-summary-promotion-v2-historical-postgres.ts",
    ), "utf8");
    expect(adapter).toContain("source.provider_key = fi.provider_key");
    expect(adapter).toContain("observation.provider_key = fi.provider_key");
    expect(adapter).toContain("rollup.provider_key = fi.provider_key");
    expect(adapter).toContain("snapshot.provider_key <> fi.provider_key");
  });

  it("adds fail-closed composite provider foreign keys", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "prisma/migrations/20260831123000_reader_summary_promotion_v2_authority_completion/migration.sql",
    ), "utf8");
    for (const table of [
      "feed_items",
      "source_item_engagement_snapshots",
      "source_item_engagement_observations",
      "source_item_engagement_daily_rollups",
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}"`);
    }
    expect(migration).toContain(
      'FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key")',
    );
    expect(migration).toContain(
      "Reader promotion authority provider lineage is inconsistent",
    );
  });
});
