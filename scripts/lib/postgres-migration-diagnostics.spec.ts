import {
  executePostgresMigrationWithDiagnostics,
  formatPostgresMigrationError,
  postgresMigrationLocation,
} from "./postgres-migration-diagnostics";

describe("PostgreSQL migration diagnostics", () => {
  const sql = [
    "CREATE TABLE public.safe_table (",
    "  id UUID PRIMARY KEY",
    ");",
    "ALTER TABLE public.safe_table",
    "  ADD COLUMN password TEXT DEFAULT 'do-not-print';",
  ].join("\n");

  it.each([
    [1, { line: 1, column: 1 }],
    ["14", { line: 1, column: 14 }],
    [sql.indexOf("ADD COLUMN") + 1, { line: 5, column: 3 }],
  ])("maps PostgreSQL position %s to a one-based migration location", (
    position,
    expected,
  ) => {
    expect(postgresMigrationLocation(sql, position)).toEqual(expected);
  });

  it.each([undefined, null, 0, -1, "1.5", "not-a-position", sql.length + 1])(
    "rejects invalid PostgreSQL position %p",
    (position) => expect(postgresMigrationLocation(sql, position)).toBeUndefined(),
  );

  it("formats stable PostgreSQL fields and a redacted statement context", () => {
    const position = sql.indexOf("ADD COLUMN") + 1;
    const formatted = formatPostgresMigrationError({
      migrationLabel: "activation/migration.sql",
      sql,
      error: Object.assign(new Error("permission denied; password=top-secret"), {
        code: "42501",
        position: String(position),
        internalPosition: "17",
        where: "SQL statement 'token=private-token'",
        routine: "aclcheck_error",
      }),
    });

    expect(formatted).toContain("sqlstate=42501");
    expect(formatted).toContain(`position=${position} (line 5, column 3)`);
    expect(formatted).toContain("internalPosition=17");
    expect(formatted).toContain('routine="aclcheck_error"');
    expect(formatted).toContain('statement="ALTER public.safe_table"');
    expect(formatted).toContain("ADD COLUMN password TEXT DEFAULT '[REDACTED]'");
    expect(formatted).not.toContain("top-secret");
    expect(formatted).not.toContain("private-token");
    expect(formatted).not.toContain("do-not-print");
  });

  it("preserves the database cause while redacting connection secrets", async () => {
    const cause = Object.assign(new Error(
      "connection to postgresql://release_admin:raw-password@db.example.test/social " +
      "failed with token=provider-secret",
    ), {
      code: "42501",
      position: "1",
      where: "password=database-secret",
    });
    const query = jest.fn().mockRejectedValue(cause);

    let thrown: unknown;
    try {
      await executePostgresMigrationWithDiagnostics(
        { query }, { migrationLabel: "telemetry/migration.sql", sql },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      cause,
      message: expect.stringMatching(
        /postgresql:\/\/\[REDACTED\]@db\.example\.test\/social/u,
      ),
    });
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(message).toContain("sqlstate=42501");
    expect(message).not.toContain("raw-password");
    expect(message).not.toContain("provider-secret");
    expect(message).not.toContain("database-secret");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
  });
});
