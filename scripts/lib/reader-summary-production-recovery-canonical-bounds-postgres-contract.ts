import {
  canonicalizeReaderSummaryWeeklyJson,
  readerSummaryWeeklyCanonicalJsonLimits,
} from "@social-monitor/summary/domain/value-objects/reader-summary-weekly-canonical-json";

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
          'sourceItemId', item.id::TEXT,
          'providerKey', item.provider_key
        ) AS evidence
        FROM source_items AS item
        WHERE item.tenant_id = $1::UUID
          AND item.workspace_id = $2::UUID
          AND item.published_at >= TIMESTAMPTZ '2026-07-24T00:00:00.000Z'
          AND item.published_at < TIMESTAMPTZ '2026-07-25T00:00:00.000Z'
        ORDER BY item.provider_key, item.provider_item_id, item.id
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
        reader_summary_weekly_canonical_json(payload)
          AS artifact_payload_canonical,
        encode(
          sha256(convert_to(
            reader_summary_weekly_canonical_json(payload),
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
  const jsArtifact = canonicalizeReaderSummaryWeeklyJson(
    artifact.artifact_payload,
    "production recovery publication artifact",
  );
  assert(
    artifact.artifact_payload_canonical === jsArtifact.json &&
      artifact.artifact_payload_sha256 === jsArtifact.sha256,
    "production recovery publication artifact canonical hash diverged",
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

  try {
    await params.client.query(
      `SELECT reader_summary_weekly_canonical_json($1::jsonb)`,
      [JSON.stringify([...atLimit, atLimit.length])],
    );
  } catch (error) {
    const postgresError = error as {
      readonly code?: unknown;
      readonly message?: unknown;
    };
    assert(
      postgresError.code === "P0001" &&
        typeof postgresError.message === "string" &&
        postgresError.message.includes(
          "weekly canonical JSON exceeds structural bounds",
        ),
      "PostgreSQL rejected 513 elements without the canonical bound error",
    );
    return;
  }
  throw new Error(
    "PostgreSQL weekly canonical JSON accepted 513 array elements",
  );
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
