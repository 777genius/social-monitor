import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import type { PrismaSummaryClient } from '@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client';

export type SummaryExecutionPostgresClient = PrismaSummaryClient & {
  readonly $transaction: <T>(
    work: (transaction: PrismaSummaryClient) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' },
  ) => Promise<T>;
  $disconnect(): Promise<void>;
};

/** Extends only the disposable database created by the existing native gate. */
export async function installSummaryExecutionTables(database: Pool, runtimeUrl: string): Promise<void> {
  const baseline = readFileSync('prisma/migrations/20260618143000_baseline/migration.sql', 'utf8');
  const required = (pattern: RegExp): string => {
    const sql = baseline.match(pattern)?.[0];
    if (sql === undefined) throw new Error('Summary execution fixture migration definition is missing');
    return sql;
  };
  await database.query(required(/CREATE TYPE "SummaryStatus"[^;]+;/));
  const role = new URL(runtimeUrl).username;
  if (!/^[a-z_0-9]+$/.test(role)) throw new Error('Invalid disposable fixture role');
  for (const table of ['summary_jobs', 'summary_artifacts']) {
    await database.query(required(new RegExp(`CREATE TABLE "${table}" \\([\\s\\S]*?\\n\\);`)));
    for (const index of baseline.matchAll(new RegExp(`CREATE (?:UNIQUE )?INDEX [^;]+ ON "${table}"[^;]+;`, 'g'))) {
      await database.query(index[0]);
    }
    await database.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON "${table}"
        USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
        WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
      GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO "${role}";`);
  }
  await database.query(`GRANT SELECT, INSERT, UPDATE ON outbox_events TO "${role}"`);
}

/** The real transaction either rolls back, or commits before its acknowledgement is lost. */
export function withSummaryCommitFault(
  client: SummaryExecutionPostgresClient,
  fault: 'before_commit' | 'after_commit',
): SummaryExecutionPostgresClient {
  let armed = true;
  return new Proxy(client, {
    get(target, key, receiver) {
      if (key === '$transaction') {
        return async <T>(
          work: (transaction: PrismaSummaryClient) => Promise<T>,
          options: { readonly isolationLevel: 'Serializable' },
        ): Promise<T> => {
          const result = await target.$transaction(async (transaction) => {
            const value = await work(transaction);
            if (armed && fault === 'before_commit') {
              armed = false;
              throw new Error('fixture crash before summary commit');
            }
            return value;
          }, options);
          if (armed && fault === 'after_commit') {
            armed = false;
            throw new Error('fixture lost summary commit acknowledgement');
          }
          return result;
        };
      }
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export async function waitForBlockedSummaryClaims(database: Pool): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const result = await database.query<{ waiting: number }>(`SELECT count(*)::int AS waiting
      FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query ILIKE '%UPDATE summary_jobs%'`);
    if ((result.rows[0]?.waiting ?? 0) >= 2) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Two summary claims did not reach the held PostgreSQL row lock');
}
