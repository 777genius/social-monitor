import {
  acquirePrismaPgRuntimeConnection,
  defaultPostgresRuntimePoolConfig,
  runWithSystemDatabaseAccess,
  type PrismaPgRuntimeClientConstructor,
} from "@social-monitor/platform-persistence";
import { loadPrismaRuntimeClient } from "@social-monitor/platform-persistence/prisma-runtime-client";

import {
  assertDailyGapPublicationBindings,
  type DailyGapPublicationRow,
} from "./lib/reader-summary-daily-gap-bindings";
import { dailyGapPublicationBindingsQuery } from "./lib/reader-summary-daily-gap-query";
import { readerSummaryProductionDayScope } from "./lib/reader-summary-production-day-scope";
import { yesterdaySocialQualityDatabaseUrl } from "./lib/yesterday-social-replay-support";

export function publicationGapDates(
  afterDate: string,
  targetDate: string,
): readonly string[] {
  assertUtcDate(afterDate, "publication cursor date");
  assertUtcDate(targetDate, "requested publication date");
  if (afterDate >= targetDate) {
    throw new Error("Publication gap target must follow the current cursor");
  }

  const dates: string[] = [];
  const cursor = new Date(`${afterDate}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.toISOString().slice(0, 10) < targetDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function verifyPublishedProductionDayGap(params: {
  readonly afterDate: string;
  readonly targetDate: string;
  readonly databaseUrl: string;
}): Promise<readonly string[]> {
  const dates = publicationGapDates(params.afterDate, params.targetDate);
  if (dates.length === 0) return dates;

  const PrismaClient =
    loadPrismaRuntimeClient<
      PrismaPgRuntimeClientConstructor<PublicationGapRuntimeClient>
    >();
  const connection = await acquirePrismaPgRuntimeConnection(
    defaultPostgresRuntimePoolConfig(params.databaseUrl, "daily-runner"),
    PrismaClient,
  );
  try {
    await runWithSystemDatabaseAccess(
      "verify published daily summary cursor gap",
      () =>
        connection.client.$transaction(
          async (transaction) => {
            await transaction.$executeRawUnsafe(
              "SET LOCAL statement_timeout = '60s'",
            );
            const rows = await transaction.$queryRawUnsafe<readonly DailyGapPublicationRow[]>(
              dailyGapPublicationBindingsQuery,
              readerSummaryProductionDayScope.tenantId,
              readerSummaryProductionDayScope.workspaceId,
              "workspace",
              dates,
            );
            assertDailyGapPublicationBindings({
              rows,
              databaseUrl: params.databaseUrl,
              scope: readerSummaryProductionDayScope,
              collectionDates: dates,
            });
          },
          {
            isolationLevel: "RepeatableRead",
            maxWait: 30_000,
            timeout: 180_000,
          },
        ),
    );
  } finally {
    await connection.close().catch(() => undefined);
  }
  return dates;
}

type PublicationGapTransactionClient = {
  $executeRawUnsafe(
    query: string,
    ...values: readonly unknown[]
  ): Promise<number>;
  $queryRawUnsafe<T>(query: string, ...values: readonly unknown[]): Promise<T>;
};

type PublicationGapRuntimeClient = PublicationGapTransactionClient & {
  $disconnect(): Promise<void>;
  $transaction<T>(
    operation: (client: PublicationGapTransactionClient) => Promise<T>,
    options: {
      readonly isolationLevel: "RepeatableRead";
      readonly maxWait: number;
      readonly timeout: number;
    },
  ): Promise<T>;
};

async function main(): Promise<void> {
  const afterDate = readOption("--after-date");
  const targetDate = readOption("--target-date");
  const dates = await verifyPublishedProductionDayGap({
    afterDate,
    targetDate,
    databaseUrl: yesterdaySocialQualityDatabaseUrl(),
  });
  console.log(
    `Verified terminal exact production publications for cursor gap ${afterDate}..${targetDate} (${dates.length} dates)`,
  );
}

function readOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function assertUtcDate(value: string, label: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is invalid`);
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
