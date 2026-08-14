import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(
  "prisma/migrations/20260814021000_reader_summary_daily_v4_scope_isolation/migration.sql",
), "utf8");

describe("Daily V4 recovery scope isolation", () => {
  it("replaces the verifier through its owning publication role", () => {
    expect(migration).toContain("GRANT USAGE, CREATE ON SCHEMA public");
    expect(migration).toContain(
      'SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"',
    );
    expect(migration).toContain("REVOKE CREATE ON SCHEMA public");
  });

  it("keeps the legacy recovery verifier on its reviewed scope", () => {
    expect(migration).toContain(
      "c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901'",
    );
    expect(migration).toContain(
      "c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902'",
    );
    expect(migration).toContain("RETURN NULL;");
  });

  it("proves the current production scope is not classified as legacy V4", () => {
    expect(migration).toContain(
      "'00000000-0000-7000-8000-000000006101'::UUID",
    );
    expect(migration).toContain(
      "'00000000-0000-7000-8000-000000006102'::UUID",
    );
    expect(migration).toContain(
      "daily canonical recovery v4 leaked into the current production scope",
    );
  });
});
