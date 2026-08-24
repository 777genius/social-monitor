import { redactSensitiveText } from "@social-monitor/shared-kernel";

type PostgresErrorFields = Readonly<{
  code?: unknown;
  internalPosition?: unknown;
  message?: unknown;
  position?: unknown;
  routine?: unknown;
  where?: unknown;
}>;

export type PostgresMigrationLocation = Readonly<{
  column: number;
  line: number;
}>;

type PostgresMigrationQuery = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const postgresMigrationLocation = (
  sql: string,
  position: unknown,
): PostgresMigrationLocation | undefined => {
  const parsed = parsePostgresPosition(position);
  const characters = Array.from(sql);
  if (parsed === undefined || parsed > characters.length) return undefined;
  let line = 1;
  let column = 1;
  for (let index = 0; index < parsed - 1; index += 1) {
    if (characters[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
};

export const formatPostgresMigrationError = (params: Readonly<{
  error: unknown;
  migrationLabel: string;
  sql: string;
}>): string => {
  const fields = postgresErrorFields(params.error);
  const location = postgresMigrationLocation(params.sql, fields.position);
  const position = safeField(fields.position) ?? "unavailable";
  const locationText = location === undefined
    ? "unavailable"
    : `line ${location.line}, column ${location.column}`;
  const statement = safeStatementContext(params.sql, location?.line);
  return [
    `PostgreSQL migration ${JSON.stringify(safeDiagnosticText(params.migrationLabel, 160))} failed`,
    `message=${JSON.stringify(safeDiagnosticText(errorMessage(params.error, fields), 240))}`,
    `sqlstate=${safeField(fields.code) ?? "unavailable"}`,
    `position=${position} (${locationText})`,
    `internalPosition=${safeField(fields.internalPosition) ?? "unavailable"}`,
    `where=${JSON.stringify(safeDiagnosticTextField(fields.where, 320))}`,
    `routine=${JSON.stringify(safeDiagnosticTextField(fields.routine, 160))}`,
    `statement=${JSON.stringify(statement.label)}`,
    `excerpt=${JSON.stringify(statement.excerpt)}`,
  ].join("; ");
};

export const executePostgresMigrationWithDiagnostics = async (
  client: PostgresMigrationQuery,
  params: Readonly<{ migrationLabel: string; sql: string }>,
): Promise<void> => {
  try {
    await client.query(params.sql);
  } catch (cause) {
    throw new Error(formatPostgresMigrationError({ ...params, error: cause }), { cause });
  }
};

const postgresErrorFields = (error: unknown): PostgresErrorFields =>
  typeof error === "object" && error !== null
    ? error as PostgresErrorFields
    : {};

const parsePostgresPosition = (value: unknown): number | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value);
  if (!/^[1-9]\d*$/u.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const safeField = (value: unknown): string | undefined => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  return text.length > 0 ? safeDiagnosticText(text, 80) : undefined;
};

const errorMessage = (error: unknown, fields: PostgresErrorFields): string => {
  if (typeof fields.message === "string") return fields.message;
  if (error instanceof Error) return error.message;
  return String(error);
};

const safeDiagnosticTextField = (value: unknown, limit: number): string =>
  typeof value === "string" && value.trim().length > 0
    ? safeDiagnosticText(value, limit)
    : "unavailable";

const safeDiagnosticText = (value: string, limit: number): string => {
  const redacted = redactSensitiveText(value)
    .replace(/'(?:''|[^'])*'/gu, "'[REDACTED]'")
    .replace(/\s+/gu, " ")
    .trim();
  return redacted.length <= limit
    ? redacted
    : `${redacted.slice(0, Math.max(0, limit - 12)).trimEnd()} [truncated]`;
};

const safeStatementContext = (
  sql: string,
  lineNumber: number | undefined,
): Readonly<{ excerpt: string; label: string }> => {
  if (lineNumber === undefined) return { label: "unavailable", excerpt: "unavailable" };
  const lines = sql.split("\n");
  const lineIndex = lineNumber - 1;
  const excerpt = safeSqlLine(lines[lineIndex] ?? "") || "blank line";
  for (let index = lineIndex; index >= Math.max(0, lineIndex - 24); index -= 1) {
    const candidate = safeSqlLine(lines[index] ?? "");
    const label = candidate.match(
      /^(CREATE(?: OR REPLACE)?|ALTER|DROP|GRANT|REVOKE|COMMENT ON|INSERT INTO|UPDATE|DELETE FROM|DO)\s+(?:(?:UNIQUE\s+)?(?:FUNCTION|TABLE|TRIGGER|INDEX|POLICY|SCHEMA|TYPE|VIEW|SEQUENCE)\s+)?([^\s(;]+)/iu,
    );
    if (label !== null) {
      return { label: `${label[1]!.toUpperCase()} ${label[2]}`, excerpt };
    }
  }
  return { label: "SQL statement", excerpt };
};

const safeSqlLine = (line: string): string => safeDiagnosticText(
  line.replace(/--.*$/u, ""),
  140,
);
