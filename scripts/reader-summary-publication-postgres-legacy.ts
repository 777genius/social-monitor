import { Pool, type PoolClient } from "pg";

import {
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
} from "@social-monitor/platform-persistence";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { PrismaReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";

const historicalTenantId = "00000000-0000-7000-8000-000000000091";
const historicalWorkspaceId = "00000000-0000-7000-8000-000000000092";

const historicalFixtures = [
  {
    id: "00000000-0000-7000-8000-000000000093",
    status: "NO_SIGNAL",
    day: 20,
    createdHour: 8,
  },
  {
    id: "00000000-0000-7000-8000-000000000094",
    status: "NO_SIGNAL",
    day: 20,
    createdHour: 10,
  },
  {
    id: "00000000-0000-7000-8000-000000000095",
    status: "COMPLETED",
    day: 21,
    createdHour: 8,
  },
  {
    id: "00000000-0000-7000-8000-000000000096",
    status: "NO_SIGNAL",
    day: 21,
    createdHour: 10,
  },
  {
    id: "00000000-0000-7000-8000-000000000097",
    status: "COMPLETED",
    day: 22,
    createdHour: 10,
  },
  {
    id: "00000000-0000-7000-8000-000000000098",
    status: "COMPLETED",
    day: 22,
    createdHour: 10,
  },
] as const;

const selectedIds = [
  historicalFixtures[1].id,
  historicalFixtures[2].id,
  historicalFixtures[5].id,
] as const;
const supersededIds = [
  historicalFixtures[0].id,
  historicalFixtures[3].id,
  historicalFixtures[4].id,
] as const;

export const seedLegacyPublicationUpgradeFixtures = async (
  databaseUrl: string,
): Promise<void> => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    for (const fixture of historicalFixtures) {
      await insertHistoricalArtifact(client, fixture);
    }
    const before = await client.query<{ readonly public_count: string }>(
      `SELECT count(*) AS public_count
         FROM reader_summary_artifacts
        WHERE id = ANY($1::uuid[])
          AND status IN ('COMPLETED', 'NO_SIGNAL')`,
      [historicalFixtures.map((fixture) => fixture.id)],
    );
    assert(
      before.rows[0]?.public_count === String(historicalFixtures.length),
      "pre-publication migration fixtures must all have legacy public statuses",
    );
  } finally {
    client.release();
    await pool.end();
  }
};

export const assertLegacyPublicationUpgrade = async (
  client: PoolClient,
  canonicalMigrationName: string,
): Promise<void> => {
  const artifacts = await client.query<{
    readonly id: string;
    readonly status: string;
  }>(
    `SELECT id, status::text AS status
       FROM reader_summary_artifacts
      WHERE id = ANY($1::uuid[])
      ORDER BY id`,
    [historicalFixtures.map((fixture) => fixture.id)],
  );
  assertDeepEqual(
    artifacts.rows,
    [
      { id: supersededIds[0], status: "SUPERSEDED" },
      { id: selectedIds[0], status: "NO_SIGNAL" },
      { id: selectedIds[1], status: "COMPLETED" },
      { id: supersededIds[1], status: "SUPERSEDED" },
      { id: supersededIds[2], status: "SUPERSEDED" },
      { id: selectedIds[2], status: "COMPLETED" },
    ],
    "legacy duplicates must remain durable with only deterministic winners public",
  );

  const publications = await client.query<{
    readonly reader_summary_artifact_id: string;
    readonly semantic_status: string;
  }>(
    `SELECT reader_summary_artifact_id, semantic_status::text AS semantic_status
       FROM reader_summary_publications
      WHERE publication_kind = 'LEGACY_BACKFILL'
      ORDER BY period_started_at`,
  );
  assertDeepEqual(
    publications.rows,
    [
      {
        reader_summary_artifact_id: selectedIds[0],
        semantic_status: "NO_SIGNAL",
      },
      {
        reader_summary_artifact_id: selectedIds[1],
        semantic_status: "COMPLETED",
      },
      {
        reader_summary_artifact_id: selectedIds[2],
        semantic_status: "COMPLETED",
      },
    ],
    "legacy selection must prefer newest NO_SIGNAL, then COMPLETED over newer NO_SIGNAL, then descending id",
  );

  const evidence = await client.query<{
    readonly artifacts: string;
    readonly publications: string;
    readonly slots: string;
    readonly active: string;
    readonly invalid_proofs: string;
    readonly invalid_migration_names: string;
  }>(
    `SELECT
       (SELECT count(*) FROM reader_summary_artifacts
         WHERE id = ANY($1::uuid[])) AS artifacts,
       (SELECT count(*) FROM reader_summary_publications
         WHERE reader_summary_artifact_id = ANY($2::uuid[])
           AND publication_kind = 'LEGACY_BACKFILL') AS publications,
       (SELECT count(*) FROM reader_summary_publication_slots
         WHERE current_publication_id = ANY($2::uuid[])) AS slots,
       (SELECT count(*)
          FROM reader_summary_publication_slots slot
          JOIN reader_summary_publications publication
            ON publication.id = slot.current_publication_id
          JOIN reader_summary_artifacts artifact
            ON artifact.id = publication.reader_summary_artifact_id
         WHERE artifact.status IN ('COMPLETED', 'NO_SIGNAL')) AS active,
       (SELECT count(*) FROM reader_summary_publications
         WHERE publication_kind = 'LEGACY_BACKFILL'
           AND exact_proof->>'schemaVersion'
             IS DISTINCT FROM
             'reader_summary.legacy_publication_proof.v1') AS invalid_proofs,
       (SELECT count(*) FROM reader_summary_publications
         WHERE publication_kind = 'LEGACY_BACKFILL'
           AND exact_proof->>'migration' IS DISTINCT FROM $3)
         AS invalid_migration_names`,
    [
      historicalFixtures.map((fixture) => fixture.id),
      selectedIds,
      canonicalMigrationName,
    ],
  );
  assertDeepEqual(
    evidence.rows[0],
    {
      artifacts: "6",
      publications: "3",
      slots: "3",
      active: "3",
      invalid_proofs: "0",
      invalid_migration_names: "0",
    },
    "migration must retain six rows but create exactly one valid active publication per legacy slot",
  );

  await assertFutureLegacyBackfillRejected(client);
  await assertLegacyPublicationHistoryImmutable(client);
};

export const assertLegacyRepositoryVisibility = async (
  schemaUrl: string,
): Promise<void> =>
  runWithTenantDatabaseAccess(
    {
      tenantId: historicalTenantId,
      workspaceId: historicalWorkspaceId,
    },
    async () => {
      const connection = await PrismaSummaryConnection.create(
        defaultPostgresRuntimePoolConfig(schemaUrl, "admin-tool"),
      );
      try {
        const repository = new PrismaReaderSummaryArtifactRepository(
          connection,
        );
        const scope = {
          tenantId: tenantId(historicalTenantId),
          workspaceId: workspaceId(historicalWorkspaceId),
        };
        const list = await repository.list({ ...scope, limit: 10 });
        const listedIds = list.items.map(
          (artifact) => artifact.toSnapshot().readerSummaryId,
        );
        assertDeepEqual(
          listedIds,
          [selectedIds[2], selectedIds[1]],
          "legacy list must return only selected COMPLETED history in newest-period order",
        );
        for (const selectedId of selectedIds) {
          const selected = await repository.findById({
            ...scope,
            readerSummaryId: selectedId,
          });
          assert(
            selected?.toSnapshot().readerSummaryId === selectedId,
            `selected legacy artifact ${selectedId} must remain findable`,
          );
        }
        for (const supersededId of supersededIds) {
          const superseded = await repository.findById({
            ...scope,
            readerSummaryId: supersededId,
          });
          assert(
            superseded === null,
            `non-selected legacy artifact ${supersededId} must fail closed`,
          );
        }
      } finally {
        await connection.close();
      }
    },
  );

const insertHistoricalArtifact = async (
  client: PoolClient,
  fixture: (typeof historicalFixtures)[number],
): Promise<void> => {
  const startedAt = utc(fixture.day, 0);
  const endedAt = utc(fixture.day + 1, 0);
  const createdAt = utc(fixture.day, fixture.createdHour);
  const noSignal = fixture.status === "NO_SIGNAL";
  const feedItemId = `historical-feed-${fixture.id}`;
  const storyClusterId = `historical-cluster-${fixture.id}`;
  const citationId = `historical-citation-${fixture.id}`;
  const canonicalUrl = `https://example.test/historical/${fixture.id}`;
  const artifactPayload = {
    schemaVersion: "reader_summary.artifact.v1",
    generatedAt: createdAt,
    period: {
      cadence: "daily",
      startedAt,
      endedAt,
      timezone: "UTC",
      periodKey: `daily:${startedAt}:${endedAt}:UTC`,
    },
    sourceWindow: {
      windowId: `historical-window-${fixture.id}`,
      startedAt,
      endedAt,
      selectedFeedItemIds: noSignal ? [] : [feedItemId],
      storyClusterIds: noSignal ? [] : [storyClusterId],
    },
    storyClusters: noSignal
      ? []
      : [
          {
            id: storyClusterId,
            storyKey: `url:${canonicalUrl}`,
            representativeFeedItemId: feedItemId,
            duplicateFeedItemIds: [],
            interestIds: ["historical-interest"],
            providerKeys: ["historical-provider"],
            score: 1,
            observedAtRange: { startedAt, endedAt: createdAt },
            whyImportant: ["Historical publication fixture evidence."],
          },
        ],
    contextArtifacts: [],
    headline: noSignal ? "Historical no signal" : "Historical public article",
    executiveSummary: noSignal
      ? "No eligible historical evidence."
      : "A historical public reader summary.",
    topStories: noSignal
      ? []
      : [
          {
            storyClusterId,
            title: "Historical public article",
            summary: "A historical public reader summary.",
            interestIds: ["historical-interest"],
            providerKeys: ["historical-provider"],
            citationIds: [citationId],
          },
        ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: noSignal
      ? []
      : [
          {
            citationId,
            feedItemId,
            sourceItemId: `historical-source-${fixture.id}`,
            providerKey: "historical-provider",
            field: "bodyPreview",
            canonicalUrl,
          },
        ],
    qualityFlags: noSignal ? ["no_signal"] : [],
    confidence: {
      level: noSignal ? "none" : "medium",
      score: noSignal ? 0 : 0.7,
      rationale: noSignal ? "No eligible evidence." : "Historical fixture.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.legacy.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "deterministic-reader-summary-v1",
      providerVersion: "legacy",
      rulesVersion: "reader_summary.rules.legacy.v1",
      evalDatasetVersion: "reader_summary.eval.legacy.v1",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    ...(noSignal ? { noSignalReason: "No eligible evidence." } : {}),
  };
  await client.query(
    `INSERT INTO reader_summary_artifacts (
       id, tenant_id, workspace_id, scope_type, scope_key, cadence,
       period_started_at, period_ended_at, period_timezone, period_key,
       status, schema_version, model_version, prompt_version, headline,
       summary_text, artifact_payload, citations, quality_signals,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'workspace', 'workspace', 'daily', $4, $5, 'UTC', $6,
       $7::"SummaryStatus", 1, 'deterministic-reader-summary-v1',
       'reader-summary.prompt.legacy.v1', $8, $9, $10::jsonb, '[]'::jsonb,
       $11::jsonb, $12, $12
     )`,
    [
      fixture.id,
      historicalTenantId,
      historicalWorkspaceId,
      startedAt,
      endedAt,
      artifactPayload.period.periodKey,
      fixture.status,
      artifactPayload.headline,
      artifactPayload.executiveSummary,
      JSON.stringify(artifactPayload),
      JSON.stringify({ qualityFlags: artifactPayload.qualityFlags }),
      createdAt,
    ],
  );
};

const assertFutureLegacyBackfillRejected = async (
  client: PoolClient,
): Promise<void> => {
  await assertDatabaseRejects(
    () =>
      client.query(
        `INSERT INTO reader_summary_publications
         SELECT * FROM reader_summary_publications WHERE id = $1`,
        [selectedIds[0]],
      ),
    "legacy publication backfill is closed",
    "future LEGACY_BACKFILL insert must be rejected by the closed backfill trigger",
  );
};

const assertLegacyPublicationHistoryImmutable = async (
  client: PoolClient,
): Promise<void> => {
  await assertDatabaseRejects(
    () =>
      client.query(
        `UPDATE reader_summary_publications
            SET published_at = published_at
          WHERE id = $1`,
        [selectedIds[0]],
      ),
    "publication ledger is immutable",
    "legacy publication ledger updates must be rejected",
  );
  await assertDatabaseRejects(
    () =>
      client.query(`DELETE FROM reader_summary_publications WHERE id = $1`, [
        selectedIds[0],
      ]),
    "publication ledger is immutable",
    "legacy publication ledger deletes must be rejected",
  );
  await assertDatabaseRejects(
    () =>
      client.query(
        `UPDATE reader_summary_artifacts
            SET headline = 'tampered'
          WHERE id = $1`,
        [selectedIds[0]],
      ),
    "published reader summary artifact is immutable",
    "legacy selected artifact content must remain bound to its proof",
  );
};

const assertDatabaseRejects = async (
  operation: () => Promise<unknown>,
  expectedMessage: string,
  assertionMessage: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      assertionMessage,
    );
    return;
  }
  throw new Error(assertionMessage);
};

const utc = (day: number, hour: number): string =>
  new Date(Date.UTC(2026, 6, day, hour)).toISOString();

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  message: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};
