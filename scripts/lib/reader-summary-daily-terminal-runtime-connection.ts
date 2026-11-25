import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type {
  ReaderSummaryDailySqlClient,
  ReaderSummaryDailySqlResult,
  ReaderSummaryDailySqlTransaction,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-daily-execution-cursor-row";

export const readerSummaryDailyTerminalRole =
  "social_monitor_reader_summary_daily_terminal";

export type ReaderSummaryDailyTerminalRuntimeEnv = Readonly<{
  READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL?: string;
  READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL?: string;
}>;

type PoolContract = Readonly<{
  connect(): Promise<PoolClient>;
  end(): Promise<void>;
}>;
type PoolFactory = (configuration: {
  readonly connectionString: string;
  readonly min: 0;
  readonly max: 1;
  readonly application_name: string;
}) => PoolContract;

export type ReaderSummaryDailyTerminalRuntimeConnection = Readonly<{
  terminal: ReaderSummaryDailySqlClient;
  auditor: PoolContract;
  close(): Promise<void>;
}>;

export const createReaderSummaryDailyTerminalRuntimeConnection = (
  env: ReaderSummaryDailyTerminalRuntimeEnv,
  poolFactory: PoolFactory = (configuration) => new Pool(configuration),
): ReaderSummaryDailyTerminalRuntimeConnection => {
  const terminalDsn = requiredDsn(
    env.READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL,
    "terminal",
  );
  const auditorDsn = requiredDsn(
    env.READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL,
    "auditor",
  );
  const terminalRole = username(terminalDsn);
  const auditorRole = username(auditorDsn);
  if (terminalRole !== readerSummaryDailyTerminalRole) {
    throw new Error("Daily terminal DSN must use the dedicated terminal role");
  }
  if (auditorRole === terminalRole) {
    throw new Error("Daily terminal and auditor DSNs must use separate roles");
  }
  if (sameEndpointAndRole(terminalDsn, auditorDsn)) {
    throw new Error("Daily terminal and auditor DSNs are not separated");
  }
  const terminalPool = poolFactory({
    connectionString: terminalDsn,
    min: 0,
    max: 1,
    application_name: "social-monitor-reader-summary-daily-terminal",
  });
  const auditorPool = poolFactory({
    connectionString: auditorDsn,
    min: 0,
    max: 1,
    application_name: "social-monitor-reader-summary-daily-auditor",
  });
  return Object.freeze({
    terminal: rawSqlClient(terminalPool),
    auditor: auditorPool,
    close: async () => {
      await Promise.all([terminalPool.end(), auditorPool.end()]);
    },
  });
};

const rawSqlClient = (pool: PoolContract): ReaderSummaryDailySqlClient => ({
  query: async () => {
    throw new Error("Daily terminal writes require a SERIALIZABLE transaction");
  },
  serializable: async <T>(
    operation: (transaction: ReaderSummaryDailySqlTransaction) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const transaction: ReaderSummaryDailySqlTransaction = {
        query: async <TRow extends Record<string, unknown>>(
          sql: string,
          values: readonly unknown[] = [],
        ): Promise<ReaderSummaryDailySqlResult<TRow>> => {
          const result = await client.query<TRow & QueryResultRow>(sql, [...values]);
          return { rows: result.rows, rowCount: result.rowCount };
        },
      };
      const result = await operation(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the operation failure; a poisoned connection is released below.
      }
      throw error;
    } finally {
      client.release();
    }
  },
});

const requiredDsn = (value: string | undefined, label: string): string => {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Daily ${label} database URL is required`);
  }
  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`Daily ${label} database URL must use PostgreSQL`);
  }
  if (parsed.password.length === 0) {
    throw new Error(`Daily ${label} database URL must carry role credentials`);
  }
  return value;
};
const username = (value: string): string => decodeURIComponent(new URL(value).username);
const sameEndpointAndRole = (left: string, right: string): boolean => {
  const first = new URL(left);
  const second = new URL(right);
  return first.hostname === second.hostname && first.port === second.port &&
    first.pathname === second.pathname && username(left) === username(right);
};
