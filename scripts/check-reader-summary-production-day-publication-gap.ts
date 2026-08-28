import { Pool } from "pg";

import { readCurrentPublicArtifactSnapshot } from "./lib/reader-summary-current-publication-bindings";
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

  const pool = new Pool({
    connectionString: params.databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 20_000,
    options: "-c social_monitor.system_access=true",
  });
  try {
    for (const collectionDate of dates) {
      await readCurrentPublicArtifactSnapshot({
        pool,
        databaseUrl: params.databaseUrl,
        scope: {
          ...readerSummaryProductionDayScope,
          scopeType: "workspace",
          scopeKey: "workspace",
        },
        collectionDates: [collectionDate],
      });
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
  return dates;
}

async function main(): Promise<void> {
  const afterDate = readOption("--after-date");
  const targetDate = readOption("--target-date");
  const dates = await verifyPublishedProductionDayGap({
    afterDate,
    targetDate,
    databaseUrl: yesterdaySocialQualityDatabaseUrl(),
  });
  console.log(
    `Verified completed exact production publications for cursor gap ${afterDate}..${targetDate} (${dates.length} dates)`,
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
