import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { PrismaReaderSummaryWeeklyProjectionReader } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-projection.reader";
import type { PrismaSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";

type ProjectionPostgresClient = Readonly<{
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

const weekStartedOn = "2026-06-01";
const weekEndedOn = "2026-06-07";

export const assertReaderSummaryWeeklyProjectionPostgresContract = async (
  client: ProjectionPostgresClient,
): Promise<void> => {
  const version = await client.query<{ server_version_num: string }>(
    "SHOW server_version_num",
  );
  assert(
    /^18[0-9]{4}$/u.test(version.rows[0]?.server_version_num ?? ""),
    "reader summary weekly projection requires PostgreSQL 18",
  );
  const timeZone = await client.query<{ time_zone: string }>(
    "SELECT current_setting('TimeZone') AS time_zone",
  );
  const originalTimeZone = timeZone.rows[0]?.time_zone;
  assert(
    typeof originalTimeZone === "string" && originalTimeZone.length > 0,
    "projection must read the PostgreSQL session time zone",
  );
  await client.query(
    "SELECT set_config('TimeZone', 'America/Los_Angeles', false)",
  );
  try {
    const prisma = prismaRawClient(client);
    const reader = new PrismaReaderSummaryWeeklyProjectionReader(prisma);
    const projection = await reader.read({
      tenantId: tenantId(readerSummaryPublicationFixtureScope.tenantId),
      workspaceId: workspaceId(readerSummaryPublicationFixtureScope.workspaceId),
      weekStartedOn,
      weekEndedOn,
    });
    assert(
      projection.certifiedDailyEvidenceDates.length === 7 &&
        projection.certifiedDailyEvidenceDates[0] === weekStartedOn &&
        projection.certifiedDailyEvidenceDates[6] === weekEndedOn,
      "projection must read exact Monday-Sunday certified evidence in America/Los_Angeles",
    );
    assert(
      projection.artifact !== null &&
        projection.artifact.proof.weekStartedOn === weekStartedOn &&
        projection.artifact.proof.weekEndedOn === weekEndedOn &&
        projection.artifact.artifact.output.sealId ===
          projection.artifact.proof.modelInputSealId &&
        projection.artifact.artifact.output.sealSha ===
          projection.artifact.proof.modelInputSealSha256,
      "projection must return one strict active WEEKLY_CERTIFIED artifact",
    );

    const isolated = await reader.read({
      tenantId: tenantId(readerSummaryPublicationFixtureScope.tenantId),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000099"),
      weekStartedOn,
      weekEndedOn,
    });
    assert(
      isolated.certifiedDailyEvidenceDates.length === 0 &&
        isolated.artifact === null,
      "projection must enforce tenant/workspace isolation",
    );
  } finally {
    await client.query("SELECT set_config('TimeZone', $1, false)", [
      originalTimeZone,
    ]);
  }
};

const prismaRawClient = (
  client: ProjectionPostgresClient,
): PrismaSummaryClient => ({
  $queryRaw: async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    const sql = strings.reduce(
      (result, part, index) =>
        `${result}${part}${index < values.length ? `$${index + 1}` : ""}`,
      "",
    );
    const result = await client.query(sql, values);
    return result.rows.map(prismaDateColumns) as T;
  },
}) as unknown as PrismaSummaryClient;

const prismaDateColumns = <TRow extends Record<string, unknown>>(
  row: TRow,
): TRow => {
  const result = { ...row };
  for (const key of ["requestedUtcDate", "weekStartedOn", "weekEndedOn"]) {
    const value = result[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      result[key as keyof TRow] = new Date(`${value}T00:00:00.000Z`) as TRow[keyof TRow];
    }
  }
  return result;
};
