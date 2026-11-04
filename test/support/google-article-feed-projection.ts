import type { Pool, PoolClient } from 'pg';
import type { IdGenerator } from '@social-monitor/shared-kernel';
import { PrismaFeedProjectionAdapter } from '../../libs/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import type { PrismaFeedClient } from '../../libs/feed/adapters/persistence/prisma/prisma-feed-client';
import type { PrismaFeedItemRecord } from '../../libs/feed/adapters/persistence/prisma/prisma-feed-records';

/** Uses only the disposable schema owned by capturePostgresFixture. */
export const googleArticleFeedProjection = async (pool: Pool, ids: IdGenerator) => {
  await pool.query(`CREATE TABLE feed_items (
    id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL, interest_id uuid NOT NULL,
    source_item_id uuid NOT NULL, source_binding_id uuid NOT NULL, provider_key text NOT NULL, dedupe_key text NOT NULL,
    canonical_url text NOT NULL, title text NOT NULL, body_preview text NOT NULL, author_handle text,
    published_at timestamptz NOT NULL, observed_at timestamptz NOT NULL, status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), provider_metadata jsonb,
    UNIQUE (tenant_id, interest_id, dedupe_key)
  ); CREATE TABLE feed_signal_baseline_samples (feed_item_id uuid PRIMARY KEY);`);
  const record = (row: Record<string, unknown>): PrismaFeedItemRecord => Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])) as PrismaFeedItemRecord;
  const clientFor = (connection: Pick<PoolClient, 'query'>): PrismaFeedClient => ({
    feedItem: {
      findFirst: async ({ where }) => {
        const row = (await connection.query(`SELECT * FROM feed_items WHERE tenant_id=$1 AND workspace_id=$2
          AND interest_id=$3 AND source_item_id=$4 AND status=$5`,
        [where.tenantId, where.workspaceId, where.interestId, where.sourceItemId, where.status])).rows[0];
        return row === undefined ? null : record(row);
      },
      upsert: async ({ create }) => record((await connection.query(`INSERT INTO feed_items
        (id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,provider_key,dedupe_key,
         canonical_url,title,body_preview,author_handle,published_at,observed_at,status,provider_metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
        RETURNING *`, [create.id, create.tenantId, create.workspaceId, create.interestId, create.sourceItemId,
        create.sourceBindingId, create.providerKey, create.dedupeKey, create.canonicalUrl, create.title,
        create.bodyPreview, create.authorHandle ?? null, create.publishedAt, create.observedAt,
        create.status, JSON.stringify(create.providerMetadata ?? null)])).rows[0]),
      update: async ({ where, data }) => record((await connection.query(`UPDATE feed_items SET
        source_item_id=$2, source_binding_id=$3, provider_key=$4, dedupe_key=$5, canonical_url=$6,
        title=$7, body_preview=$8, author_handle=$9, provider_metadata=$10::jsonb WHERE id=$1 RETURNING *`,
      [where.id, data.sourceItemId, data.sourceBindingId, data.providerKey, data.dedupeKey,
        data.canonicalUrl, data.title, data.bodyPreview, data.authorHandle ?? null,
        JSON.stringify(data.providerMetadata ?? null)])).rows[0]),
      findMany: async () => { throw new Error('Unexpected fixture feed listing'); },
      count: async () => Number((await connection.query('SELECT count(*) FROM feed_items')).rows[0].count),
    },
    feedSignalBaselineSample: {
      deleteMany: async ({ where }) => ({ count: (await connection.query(
        'DELETE FROM feed_signal_baseline_samples WHERE feed_item_id=$1', [where.feedItemId])).rowCount ?? 0 }),
      upsert: async () => { throw new Error('RSS article must not invent engagement metrics'); },
      findMany: async () => [],
    },
  });
  const client: PrismaFeedClient = {
    ...clientFor(pool),
    $transaction: async (operation, options) => {
      if (options.isolationLevel !== 'Serializable') throw new Error('Expected Serializable feed projection');
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await operation(clientFor(connection));
        await connection.query('COMMIT');
        return result;
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
    },
  };
  return {
    adapter: new PrismaFeedProjectionAdapter(client, ids),
    read: async () => record((await pool.query('SELECT * FROM feed_items')).rows[0]),
  };
};
