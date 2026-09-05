import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";

export async function assertEngagementSnapshotRefreshPostgres(params: {
  readonly fixturePool: Pool;
  readonly runtimeDatabaseUrl: string;
  readonly tenant: string;
  readonly workspace: string;
  readonly binding: string;
}): Promise<void> {
  const database = await params.fixturePool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert(
    /^reader_summary_publication_test_[0-9a-f]{20}$/.test(database.rows[0]?.name ?? ""),
    "engagement refresh proof requires the disposable publication fixture",
  );
  const connection = await PrismaIngestionWorkerConnection.createForProcess(
    params.runtimeDatabaseUrl, "ingestion-worker",
  );
  const adapter = new PrismaSourceEngagementProjectionAdapter(connection, {
    generate: randomUUID,
  });
  try {
    for (const provider of ["reddit", "hacker-news"] as const) {
      const sourceItemId = randomUUID();
      const externalId = `engagement-refresh-${provider}`;
      const initialAt = new Date("2026-08-19T12:00:00.000Z");
      const publishedAt = new Date("2026-08-19T11:00:00.000Z");
      await params.fixturePool.query(`
        INSERT INTO source_items (id, tenant_id, workspace_id, source_binding_id,
          provider_key, provider_item_id, canonical_url, title, body, published_at,
          content_hash, observed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, 'https://example.test/engagement',
          'Engagement fixture', 'Bounded fixture', $7, 'engagement-fixture', $8, '{}')
      `, [sourceItemId, params.tenant, params.workspace, params.binding,
        provider, externalId, publishedAt, initialAt]);
      const scope = {
        tenantId: tenantId(params.tenant),
        workspaceId: workspaceId(params.workspace),
      };
      const project = (observedAt: Date, score: number) =>
        runWithTenantDatabaseAccess(scope, () => adapter.project({
          ...scope,
          sourceBindingId: params.binding,
          scanJobId: randomUUID(),
          providerKey: provider,
          observedAt,
          samples: [{
            externalId, sourceItemId, publishedAt,
            metrics: provider === "reddit" ? { score } : { points: score },
            metricsFingerprint: `${provider}:${score}`,
            providerMetadataPatch: {},
            refreshReadModels: false,
          }],
        }));
      const readSnapshot = () => runWithTenantDatabaseAccess(scope, () =>
        connection.sourceItemEngagementSnapshot.findUnique({
          where: { tenantId_workspaceId_sourceItemId: { ...scope, sourceItemId } },
        }));

      assert((await project(initialAt, 10)).observationsAppended === 1,
        `${provider}: initial observation must be persisted`);
      const initial = await readSnapshot();
      assert(initial !== null, `${provider}: initial snapshot missing`);
      for (const [time, score] of [
        ["2026-08-19T12:01:00.000Z", 10],
        ["2026-08-19T12:02:00.000Z", 12],
      ] as const) {
        const result = await project(new Date(time), score);
        const current = await readSnapshot();
        assert(result.observationsAppended === 0 && result.currentSnapshotsUpdated === 1,
          `${provider}: a pre-cadence refresh must update only the snapshot`);
        assert(current?.firstObservedAt.getTime() === initialAt.getTime() &&
          current.lastObservedAt.toISOString() === time &&
          current.lastObservationAt.getTime() === initial?.lastObservationAt.getTime() &&
          current.nextObservationDueAt.getTime() === initial?.nextObservationDueAt.getTime(),
        `${provider}: repeat refresh changed the original observation or cadence`);
        assert((provider === "reddit" ? current?.score : current?.points) === BigInt(score),
          `${provider}: latest metrics were not refreshed`);
        const expectedChange = score === 10 ? initialAt.toISOString() : time;
        assert(current?.lastChangedAt.toISOString() === expectedChange,
          `${provider}: metric change timestamp is inconsistent`);
      }
      const observations = await params.fixturePool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM source_item_engagement_observations WHERE tenant_id=$1 AND workspace_id=$2 AND source_item_id=$3",
        [params.tenant, params.workspace, sourceItemId],
      );
      assert(observations.rows[0]?.count === "1",
        `${provider}: repeated refresh appended a duplicate observation`);
    }
    console.log("source_engagement_repeat_refresh_postgres=ok unchanged_and_changed=true");
  } finally {
    await connection.close();
  }
}
