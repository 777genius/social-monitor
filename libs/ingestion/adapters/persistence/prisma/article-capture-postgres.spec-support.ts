import { Pool, type PoolClient } from 'pg';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import type { PrismaSourceItemRecord } from './prisma-ingestion-records';

// Only an explicitly configured local test database is accepted. Every run
// owns a disposable schema and never migrates or modifies existing tables.
export const capturePostgresFixture = async (url: string, runId: string) => {
  const target = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !/test|sandbox/.test(target.pathname)) {
    throw new Error('Capture SQL tests require a local test/sandbox database');
  }
  if (!/^[a-f0-9]{32}$/.test(runId)) throw new Error('Invalid fixture run id');
  const schema = `capture_test_${runId}`;
  const pool = new Pool({ connectionString: url, min: 0, max: 4,
    options: `-c search_path=${schema} -c statement_timeout=10000` });
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`
    CREATE TABLE source_items (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
      source_binding_id uuid NOT NULL, provider_key text NOT NULL, provider_item_id text NOT NULL,
      canonical_url text NOT NULL, title text NOT NULL, body text NOT NULL, author_handle text,
      published_at timestamptz NOT NULL, observed_at timestamptz NOT NULL,
      last_observed_at timestamptz, content_updated_at timestamptz, created_at timestamptz NOT NULL,
      content_hash text NOT NULL, provider_content_hash text, metadata jsonb NOT NULL
    );
    CREATE TABLE scan_leases (
      tenant_id uuid NOT NULL, workspace_id uuid NOT NULL, scan_job_id uuid NOT NULL,
      fencing_token text NOT NULL, expires_at timestamptz NOT NULL
    );
  `);
  const clientFor = (connection: PoolClient) => ({
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) =>
      (await connection.query(strings.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values)).rows,
    sourceItem: {
      findFirst: async ({ where }: { where: { tenantId: string; workspaceId: string; providerKey: string; providerItemId: string } }) => {
        const row = (await connection.query(`SELECT * FROM source_items WHERE tenant_id=$1 AND workspace_id=$2
          AND provider_key=$3 AND provider_item_id=$4`, [where.tenantId, where.workspaceId, where.providerKey, where.providerItemId])).rows[0];
        return row === undefined ? null : fromRow(row);
      },
    },
  });
  let transactionCount = 0;
  let activePid = 0;
  const client = {
    $transaction: async <T>(operation: (tx: PrismaIngestionClient) => Promise<T>, options: { isolationLevel: string }) => {
      if (options.isolationLevel !== 'Serializable') throw new Error('Expected Serializable isolation');
      transactionCount += 1;
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        activePid = (await connection.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const result = await operation(clientFor(connection) as unknown as PrismaIngestionClient);
        await connection.query('COMMIT');
        return result;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
  } as unknown as PrismaIngestionClient;
  return { pool, client, transactionCount: () => transactionCount,
    waitForSourceLock: async () => {
      for (let i = 0; i < 200; i += 1) {
        const row = (await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [activePid])).rows[0];
        if (row?.wait_event_type === 'Lock') return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Completion never waited on the competing source transaction');
    },
    read: async () => fromRow((await pool.query('SELECT * FROM source_items')).rows[0]),
    close: async () => { try { await pool.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await pool.end(); } },
  };
};

const fromRow = (row: Record<string, unknown>): PrismaSourceItemRecord => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]),
) as PrismaSourceItemRecord;
