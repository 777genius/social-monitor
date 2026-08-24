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

  it("rethrows once with the original PostgreSQL error as the cause", async () => {
    const cause = Object.assign(new Error("permission denied for schema public"), {
      code: "42501",
      position: "1",
    });
    const query = jest.fn().mockRejectedValue(cause);

    await expect(executePostgresMigrationWithDiagnostics(
      { query },
      { migrationLabel: "activation/migration.sql", sql },
    )).rejects.toMatchObject({ cause, message: expect.stringContaining("sqlstate=42501") });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(sql);
  });
});
