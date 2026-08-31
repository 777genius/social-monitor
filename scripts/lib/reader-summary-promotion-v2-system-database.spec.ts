import {
  assertHistoricalPromotionSystemRole,
  requiredHistoricalPromotionSystemDatabaseUrl,
} from
  "./reader-summary-promotion-v2-system-database";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("historical Promotion V2 system database boundary", () => {
  it("never falls back to a generic or API DSN", () => {
    expect(() => requiredHistoricalPromotionSystemDatabaseUrl({
      DATABASE_URL: "postgresql://api@example.invalid/app",
    })).toThrow("SYSTEM_DATABASE_URL is required");
  });

  it("admits only the explicit PostgreSQL system-runtime DSN", () => {
    expect(requiredHistoricalPromotionSystemDatabaseUrl({
      SYSTEM_DATABASE_URL: "postgresql://system@example.invalid/app",
      DATABASE_URL: "postgresql://api@example.invalid/app",
    })).toBe("postgresql://system@example.invalid/app");
    expect(() => requiredHistoricalPromotionSystemDatabaseUrl({
      SYSTEM_DATABASE_URL: "https://example.invalid",
    })).toThrow("PostgreSQL DSN");
  });

  it("preflights the RLS role without dropping tenant/workspace predicates", () => {
    const source = readFileSync(join(
      process.cwd(),
      "scripts/lib/reader-summary-promotion-v2-historical-postgres.ts",
    ), "utf8");
    expect(source).toContain("pg_has_role(");
    expect(source).toContain("social_monitor_tenant_system_runtime");
    expect(source).toContain("fi.tenant_id = $1::uuid");
    expect(source).toContain("fi.workspace_id = $2::uuid");
  });

  it("rejects an API role before an RLS-protected read can look empty", async () => {
    const client = { $queryRaw: jest.fn(async () => [{
      currentUser: "social_monitor_api_runtime",
      systemRuntimeMember: false,
    }]) as never };
    await expect(assertHistoricalPromotionSystemRole(client))
      .rejects.toThrow("rejected database role social_monitor_api_runtime");
  });
});
