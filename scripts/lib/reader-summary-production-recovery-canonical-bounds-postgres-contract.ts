import {
  canonicalizeReaderSummaryProductionRecoveryJson,
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryProductionRecoveryCanonicalJsonLimits,
  readerSummaryWeeklyCanonicalJsonLimits,
} from "@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import { readerSummaryProductionRecoveryRequestedUtcDates } from "@social-monitor/summary/ports";

type CanonicalBoundsPostgresClient = Readonly<{
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const assertReaderSummaryProductionRecoveryCanonicalBounds = async (
  params: Readonly<{
    client: CanonicalBoundsPostgresClient;
    tenantId: string;
    workspaceId: string;
  }>,
): Promise<void> => {
  const recoveryArtifact = await params.client.query<{
    readonly artifact_payload: unknown;
    readonly artifact_payload_canonical: string;
    readonly artifact_payload_sha256: string;
    readonly source_evidence_count: number;
  }>(
    `
      WITH recovery_source_evidence AS (
        SELECT jsonb_build_object(
          'providerKey', source.provider_key,
          'feedItemId', feed.id::TEXT,
          'sourceItemId', source.id::TEXT,
          'sourceBindingId', source.source_binding_id::TEXT,
          'interestId', feed.interest_id::TEXT,
          'providerItemId', source.provider_item_id,
          'canonicalUrl', source.canonical_url,
          'title', feed.title,
          'bodyPreview', feed.body_preview,
          'sourceText', LEFT(
            COALESCE(NULLIF(feed.body_preview, ''), source.body),
            4096
          ),
          'authorHandle', feed.author_handle,
          'sourceContentHash', source.content_hash,
          'sourceProviderContentHash', source.provider_content_hash,
          'publishedAt', to_char(
            feed.published_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'observedAt', to_char(
            feed.observed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        ) AS evidence
        FROM source_items AS source
        JOIN feed_items AS feed
          ON feed.source_item_id = source.id
          AND feed.tenant_id = source.tenant_id
          AND feed.workspace_id = source.workspace_id
        WHERE source.tenant_id = $1::UUID
          AND source.workspace_id = $2::UUID
          AND feed.published_at >=
            TIMESTAMPTZ '2026-07-24T00:00:00.000Z'
          AND feed.published_at <
            TIMESTAMPTZ '2026-07-25T00:00:00.000Z'
        ORDER BY
          source.provider_key,
          source.provider_item_id,
          source.id
        LIMIT 350
      ),
      recovery_artifact AS (
        SELECT
          jsonb_build_object(
            'schemaVersion', 'reader_summary.artifact.v1',
            'sourceEvidence', jsonb_agg(evidence)
          ) AS payload,
          count(*)::INTEGER AS source_evidence_count
        FROM recovery_source_evidence
      )
      SELECT
        payload AS artifact_payload,
        reader_summary_production_recovery_canonical_json(payload)
          AS artifact_payload_canonical,
        encode(
          sha256(convert_to(
            reader_summary_production_recovery_canonical_json(payload),
            'UTF8'
          )),
          'hex'
        ) AS artifact_payload_sha256,
        source_evidence_count
      FROM recovery_artifact
    `,
    [params.tenantId, params.workspaceId],
  );
  const artifact = recoveryArtifact.rows[0];
  assert(
    artifact?.source_evidence_count === 350,
    "production recovery publication artifact did not use 350 DB rows",
  );
  const jsArtifact = canonicalizeReaderSummaryProductionRecoveryJson(
    artifact.artifact_payload,
    "production recovery publication artifact",
  );
  assert(
    artifact.artifact_payload_canonical === jsArtifact.json &&
      artifact.artifact_payload_sha256 === jsArtifact.sha256,
    "production recovery publication artifact canonical hash diverged",
  );
  assertRejects(
    () =>
      canonicalizeReaderSummaryWeeklyJson(
        artifact.artifact_payload,
        "production recovery publication artifact",
      ),
    "total object key limit",
    "shared weekly bounds unexpectedly admitted full recovery evidence",
  );
  await assertPostgresRejects(
    params.client,
    `SELECT reader_summary_weekly_canonical_json($1::jsonb)`,
    artifact.artifact_payload,
    "weekly canonical JSON exceeds structural bounds",
    "PostgreSQL shared weekly bounds unexpectedly admitted recovery evidence",
  );

  const identityBody = {
    schemaVersion: "reader_summary.production_recovery_identity.v2",
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedUtcDates: readerSummaryProductionRecoveryRequestedUtcDates,
  };
  const identityCanonical = await params.client.query<{
    readonly recovery_canonical: string;
    readonly weekly_canonical: string;
  }>(
    `
      SELECT
        reader_summary_production_recovery_canonical_json($1::jsonb)
          AS recovery_canonical,
        reader_summary_weekly_canonical_json($1::jsonb)
          AS weekly_canonical
    `,
    [JSON.stringify(identityBody)],
  );
  const identity = identityCanonical.rows[0];
  const jsRecoveryIdentity =
    canonicalizeReaderSummaryProductionRecoveryJson(identityBody);
  const jsWeeklyIdentity = canonicalizeReaderSummaryWeeklyJson(identityBody);
  assert(
    identity?.recovery_canonical === jsRecoveryIdentity.json &&
      identity.weekly_canonical === jsWeeklyIdentity.json &&
      jsRecoveryIdentity.sha256 === jsWeeklyIdentity.sha256,
    "production recovery identity canonical hash drifted across bounds",
  );

  const atRecoveryKeyLimit = totalObjectKeyFixture(
    readerSummaryProductionRecoveryCanonicalJsonLimits.maxTotalObjectKeys,
  );
  const postgresRecoveryAtLimit = await params.client.query<{
    readonly canonical: string;
  }>(
    `SELECT reader_summary_production_recovery_canonical_json(
       $1::jsonb
     ) AS canonical`,
    [JSON.stringify(atRecoveryKeyLimit)],
  );
  assert(
    postgresRecoveryAtLimit.rows[0]?.canonical ===
      canonicalizeReaderSummaryProductionRecoveryJson(
        atRecoveryKeyLimit,
      ).json,
    "PostgreSQL and JavaScript recovery object-key bounds diverged",
  );
  const aboveRecoveryKeyLimit = totalObjectKeyFixture(
    readerSummaryProductionRecoveryCanonicalJsonLimits.maxTotalObjectKeys + 1,
  );
  assertRejects(
    () =>
      canonicalizeReaderSummaryProductionRecoveryJson(
        aboveRecoveryKeyLimit,
      ),
    "total object key limit",
    "JavaScript recovery canonicalizer admitted one key above its bound",
  );
  await assertPostgresRejects(
    params.client,
    `SELECT reader_summary_production_recovery_canonical_json(
       $1::jsonb
     )`,
    aboveRecoveryKeyLimit,
    "production recovery canonical JSON exceeds total object-key bound",
    "PostgreSQL recovery canonicalizer admitted one key above its bound",
  );

  const atLimit = Array.from(
    { length: readerSummaryWeeklyCanonicalJsonLimits.maxArrayElements },
    (_, index) => index,
  );
  const postgresAtLimit = await params.client.query<{
    readonly canonical: string;
  }>(
    `SELECT reader_summary_weekly_canonical_json($1::jsonb) AS canonical`,
    [JSON.stringify(atLimit)],
  );
  assert(
    postgresAtLimit.rows[0]?.canonical ===
      canonicalizeReaderSummaryWeeklyJson(atLimit).json,
    "PostgreSQL and JavaScript 512-element canonical bounds diverged",
  );

  await assertPostgresRejects(
    params.client,
    `SELECT reader_summary_weekly_canonical_json($1::jsonb)`,
    [...atLimit, atLimit.length],
    "weekly canonical JSON exceeds structural bounds",
    "PostgreSQL weekly canonical JSON accepted 513 array elements",
  );
};

const totalObjectKeyFixture = (
  keyCount: number,
): readonly Readonly<Record<string, null>>[] => {
  const objects: Record<string, null>[] = [];
  for (let offset = 0; offset < keyCount; offset += 64) {
    objects.push(
      Object.fromEntries(
        Array.from(
          { length: Math.min(64, keyCount - offset) },
          (_unused, index) => [`key-${offset + index}`, null],
        ),
      ),
    );
  }
  return objects;
};

const assertRejects = (
  operation: () => unknown,
  expectedMessage: string,
  failureMessage: string,
): void => {
  try {
    operation();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      failureMessage,
    );
    return;
  }
  throw new Error(failureMessage);
};

const assertPostgresRejects = async (
  client: CanonicalBoundsPostgresClient,
  sql: string,
  value: unknown,
  expectedMessage: string,
  failureMessage: string,
): Promise<void> => {
  try {
    await client.query(sql, [JSON.stringify(value)]);
  } catch (error) {
    const postgresError = error as {
      readonly code?: unknown;
      readonly message?: unknown;
    };
    assert(
      postgresError.code === "P0001" &&
        typeof postgresError.message === "string" &&
        postgresError.message.includes(expectedMessage),
      failureMessage,
    );
    return;
  }
  throw new Error(failureMessage);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
