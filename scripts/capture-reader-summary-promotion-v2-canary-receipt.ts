import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Pool, type PoolClient } from "pg";
import { runWithTenantDatabaseAccess } from
  "@social-monitor/platform-persistence";

import { loadDotenvIfPresent } from "./lib/env-file";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import { requiredHistoricalPromotionSystemDatabaseUrl } from
  "./lib/reader-summary-promotion-v2-system-database";
import {
  parseRollbackAuthorityReceipt,
  type CanaryPublicationReceipt,
} from "./run-reader-summary-promotion-v2-rollback";

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message :
      "Promotion V2 canary receipt capture failed");
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const systemDatabaseUrl = requiredHistoricalPromotionSystemDatabaseUrl(
    process.env,
  );
  const pool = new Pool({
    connectionString: systemDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const receipt = await captureReceipt(pool, options);
    const outputPath = join(
      options.artifactOutput,
      options.date,
      "reader-summary-promotion-v2-canary-publication.receipt.v1.json",
    );
    writeImmutable(outputPath, receipt);
    console.log(`promotion_v2_canary_publication_receipt=${outputPath}`);
  } finally {
    await pool.end();
  }
}

const captureReceipt = async (
  pool: Pool,
  input: ReturnType<typeof parseOptions>,
): Promise<CanaryPublicationReceipt> =>
  runWithTenantDatabaseAccess(readerSummaryProductionDayScope, async () => {
    const client = await pool.connect();
    try {
      await preflightRole(client);
      await client.query(
        "SELECT set_config('social_monitor.system_access', 'true', false)",
      );
      const result = await client.query<{ receipt: unknown }>(`
        SELECT public."reader_summary_promotion_v2_canary_receipt"(
          $1::uuid, $2::uuid, $3::date, $4::uuid
        ) AS receipt
      `, [
        readerSummaryProductionDayScope.tenantId,
        readerSummaryProductionDayScope.workspaceId,
        input.date,
        input.expectedV2PublicationId,
      ]);
      const raw = result.rows[0]?.receipt;
      const receipt = parseRollbackAuthorityReceipt(Buffer.from(
        JSON.stringify(raw),
      ));
      if (receipt.format !==
          "reader-summary-promotion-v2-canary-publication-receipt-v1") {
        throw new Error("Promotion V2 canary receipt format is invalid");
      }
      return receipt;
    } finally {
      client.release();
    }
  });

const preflightRole = async (client: PoolClient): Promise<void> => {
  const result = await client.query<{ member: boolean }>(`SELECT pg_has_role(
    current_user,'social_monitor_tenant_system_runtime','USAGE') AS member`);
  if (result.rows[0]?.member !== true) {
    throw new Error("Promotion V2 canary receipt RLS preflight failed");
  }
};

const parseOptions = (args: readonly string[]) => {
  const read = (name: string): string => {
    const index = args.indexOf(name);
    const value = index < 0 ? undefined : args[index + 1]?.trim();
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new Error(`${name} is required`);
    }
    return value;
  };
  const date = read("--date");
  const expectedV2PublicationId = read("--expected-v2-publication-id");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(expectedV2PublicationId)) {
    throw new Error("Promotion V2 canary receipt locator is invalid");
  }
  return {
    date,
    expectedV2PublicationId,
    artifactOutput: resolve(read("--artifact-output")),
  };
};

const writeImmutable = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o400,
  });
};
