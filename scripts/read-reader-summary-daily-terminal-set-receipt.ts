import { resolve } from "node:path";

import { Pool } from "pg";

import { readerSummaryDailyTerminalRole } from "./lib/reader-summary-daily-terminal-runtime-connection";
import {
  buildReaderSummaryDailyTerminalSetReceipt,
  readReaderSummaryDailyTerminalSetRows,
} from "./lib/reader-summary-daily-terminal-set-receipt";

export const main = async (): Promise<void> => {
  if (process.argv.length !== 2) {
    throw new Error("Daily terminal-set receipt reader accepts no arguments");
  }
  const databaseUrl = terminalDatabaseUrl(required("SYSTEM_DATABASE_URL"));
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    application_name: "social-monitor-reader-summary-daily-terminal-set-receipt",
  });
  try {
    const client = await pool.connect();
    let receiptLine: string;
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const rows = await readReaderSummaryDailyTerminalSetRows(client);
      receiptLine = `${JSON.stringify(buildReaderSummaryDailyTerminalSetReceipt(rows))}\n`;
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    process.stdout.write(receiptLine);
  } finally {
    await pool.end();
  }
};

export const terminalDatabaseUrl = (systemDatabaseUrl: string): string => {
  const parsed = new URL(systemDatabaseUrl);
  if (!/^postgres(?:ql)?:$/u.test(parsed.protocol) ||
      decodeURIComponent(parsed.username) !== "social_monitor_system_app" ||
      parsed.password.length === 0) {
    throw new Error("SYSTEM_DATABASE_URL must use the production system login");
  }
  parsed.username = readerSummaryDailyTerminalRole;
  return parsed.toString();
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === __filename) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
