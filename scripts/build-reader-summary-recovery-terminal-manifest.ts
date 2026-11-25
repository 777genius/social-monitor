import { Pool } from "pg";

import { assertReaderSummaryWeeklyDenseArray } from "../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  buildReaderSummaryRecoveryTerminalManifest,
  deriveRecoveryTerminalDatabaseIdentity,
  publishReaderSummaryRecoveryTerminalManifest,
  type RecoveryTerminalManifestDatabaseRow,
  type RecoveryTerminalManifestEvidenceRow,
  type RecoveryTerminalManifestPublishResult,
} from "./lib/reader-summary-recovery-terminal-manifest";
import {
  openRecoveryTerminalImmutableSource,
  type RecoveryTerminalFilesystemCheckpointHandler,
} from "./lib/reader-summary-recovery-terminal-manifest-filesystem";

export const recoveryTerminalScratchDatabaseUrlEnvironmentName =
  "READER_SUMMARY_RECOVERY_SCRATCH_DATABASE_URL";

export type RecoveryTerminalManifestOptions = Readonly<{
  requestedUtcDate: string;
  tenantId: string;
  workspaceId: string;
  dumpPath: string;
  expectedDumpSha256: string;
  expectedDatabaseIdentity: string;
  excludedFeedItemIds: readonly string[];
  outputPath: string;
}>;

export interface RecoveryTerminalManifestQueryClient {
  query<TRow extends Readonly<Record<string, unknown>>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}

export const recoveryTerminalManifestDatabaseIdentitySql = `
  SELECT
    current_database()::TEXT AS "databaseName",
    database."oid"::TEXT AS "databaseOid",
    control."system_identifier"::TEXT AS "systemIdentifier",
    current_setting('server_version_num')::TEXT AS "serverVersionNumber",
    current_setting('transaction_read_only')::TEXT AS "transactionReadOnly"
  FROM pg_catalog.pg_database AS database
  CROSS JOIN LATERAL pg_catalog.pg_control_system() AS control
  WHERE database."datname" = current_database()
    AND current_setting('transaction_read_only') = 'on'
`;

export const recoveryTerminalManifestEvidenceSql = `
  SELECT
    feed."provider_key" AS "providerKey",
    feed."id"::TEXT AS "feedItemId",
    source."id"::TEXT AS "sourceItemId",
    source."source_binding_id"::TEXT AS "sourceBindingId",
    feed."interest_id"::TEXT AS "interestId",
    source."provider_item_id" AS "providerItemId",
    source."canonical_url" AS "canonicalUrl",
    feed."title" AS "title",
    feed."body_preview" AS "bodyPreview",
    LEFT(COALESCE(NULLIF(feed."body_preview", ''), source."body"), 4096)
      AS "sourceText",
    feed."author_handle" AS "authorHandle",
    source."content_hash" AS "sourceContentHash",
    source."provider_content_hash" AS "sourceProviderContentHash",
    feed."published_at" AS "publishedAt",
    feed."observed_at" AS "observedAt",
    github."result_id"::TEXT AS "githubResultId",
    github."scan_job_id"::TEXT AS "githubScanJobId",
    github."attempt_number" AS "githubAttemptNumber",
    github."repository_identity" AS "githubRepositoryIdentity",
    github."rank" AS "githubRank",
    github."checked_at" AS "githubCheckedAt"
  FROM "feed_items" AS feed
  JOIN (
    VALUES
      (1, 'github-trending-page'),
      (2, 'hacker-news'),
      (3, 'reddit'),
      (4, 'rss'),
      (5, 'x-twitter')
  ) AS provider_order("ordinal", "provider_key")
    ON provider_order."provider_key" = feed."provider_key"
  JOIN "source_items" AS source
    ON source."id" = feed."source_item_id"
    AND source."tenant_id" = feed."tenant_id"
    AND source."workspace_id" = feed."workspace_id"
    AND source."source_binding_id" = feed."source_binding_id"
    AND source."provider_key" = feed."provider_key"
    AND source."canonical_url" = feed."canonical_url"
  JOIN "source_bindings" AS binding
    ON binding."id" = source."source_binding_id"
    AND binding."tenant_id" = source."tenant_id"
    AND binding."workspace_id" = source."workspace_id"
    AND binding."interest_id" = feed."interest_id"
    AND binding."status" = 'ENABLED'
    AND binding."deleted_at" IS NULL
  JOIN "source_catalog_entries" AS catalog
    ON catalog."id" = binding."source_catalog_entry_id"
    AND catalog."provider_key" = feed."provider_key"
  JOIN "interests" AS interest
    ON interest."id" = binding."interest_id"
    AND interest."tenant_id" = binding."tenant_id"
    AND interest."workspace_id" = binding."workspace_id"
    AND interest."status" = 'ENABLED'
    AND interest."deleted_at" IS NULL
  LEFT JOIN LATERAL (
    SELECT
      result."id" AS "result_id",
      result."scan_job_id",
      attempt."attempt_number",
      result."repository_full_name" AS "repository_identity",
      result."rank",
      result."checked_at"
    FROM "github_repository_trend_results" AS result
    JOIN "scan_jobs" AS scan
      ON scan."id" = result."scan_job_id"
      AND scan."tenant_id" = result."tenant_id"
      AND scan."workspace_id" = result."workspace_id"
      AND scan."source_binding_id" = result."source_binding_id"
      AND scan."status" = 'SUCCEEDED'
    JOIN LATERAL (
      SELECT completed."attempt_number"
      FROM "scan_attempts" AS completed
      WHERE completed."scan_job_id" = scan."id"
        AND completed."tenant_id" = scan."tenant_id"
        AND completed."workspace_id" = scan."workspace_id"
        AND completed."source_binding_id" = scan."source_binding_id"
        AND completed."status" = 'SUCCEEDED'
        AND completed."finished_at" IS NOT NULL
      ORDER BY completed."attempt_number" DESC
      LIMIT 1
    ) AS attempt ON TRUE
    WHERE feed."provider_key" = 'github-trending-page'
      AND result."source_item_id" = source."id"
      AND result."tenant_id" = source."tenant_id"
      AND result."workspace_id" = source."workspace_id"
      AND result."source_binding_id" = source."source_binding_id"
      AND result."repository_url" = source."canonical_url"
      AND result."primary_window" IN ('daily', 'today')
      AND result."checked_at" >= $3::TIMESTAMPTZ
      AND result."checked_at" < $4::TIMESTAMPTZ
    ORDER BY result."checked_at" DESC, result."id"::TEXT COLLATE "C"
    LIMIT 1
  ) AS github ON TRUE
  WHERE feed."tenant_id" = $1::UUID
    AND feed."workspace_id" = $2::UUID
    AND feed."status" = 'VISIBLE'
    AND feed."published_at" >= $3::TIMESTAMPTZ
    AND feed."published_at" < $4::TIMESTAMPTZ
  ORDER BY provider_order."ordinal", feed."id"::TEXT COLLATE "C"
`;

const valueOptions = new Set([
  "--date",
  "--tenant-id",
  "--workspace-id",
  "--dump",
  "--expected-dump-sha256",
  "--expected-database-identity",
  "--exclude-feed-item-id",
  "--out",
]);

export const parseRecoveryTerminalManifestOptions = (
  args: readonly string[],
): RecoveryTerminalManifestOptions => {
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      option === undefined ||
      !valueOptions.has(option) ||
      value === undefined ||
      value.startsWith("--") ||
      value.trim().length === 0
    ) {
      throw new Error("Invalid recovery terminal manifest argument");
    }
    values.set(option, [...(values.get(option) ?? []), value.trim()]);
  }
  const excludedFeedItemIds = [
    ...(values.get("--exclude-feed-item-id") ?? []),
  ].sort(codeUnitCompare);
  if (new Set(excludedFeedItemIds).size !== excludedFeedItemIds.length) {
    throw new Error("Excluded feed item identifiers must be distinct");
  }
  return Object.freeze({
    requestedUtcDate: single(values, "--date"),
    tenantId: single(values, "--tenant-id"),
    workspaceId: single(values, "--workspace-id"),
    dumpPath: single(values, "--dump"),
    expectedDumpSha256: single(values, "--expected-dump-sha256"),
    expectedDatabaseIdentity: single(
      values,
      "--expected-database-identity",
    ),
    excludedFeedItemIds: Object.freeze(excludedFeedItemIds),
    outputPath: single(values, "--out"),
  });
};

export const extractReaderSummaryRecoveryTerminalManifest = async (params: {
  readonly client: RecoveryTerminalManifestQueryClient;
  readonly requestedUtcDate: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly dumpPath: string;
  readonly expectedDumpSha256: string;
  readonly expectedDatabaseIdentity: string;
  readonly excludedFeedItemIds?: readonly string[];
  readonly outputPath: string;
  readonly filesystemCheckpoint?: RecoveryTerminalFilesystemCheckpointHandler;
}): Promise<RecoveryTerminalManifestPublishResult> => {
  const source = openRecoveryTerminalImmutableSource({
    path: params.dumpPath,
    expectedSha256: params.expectedDumpSha256,
    checkpoint: params.filesystemCheckpoint,
  });
  try {
    const databaseIdentity = await readVerifiedDatabaseIdentity(
      params.client,
      params.expectedDatabaseIdentity,
    );
    const rows = await readRecoveryTerminalEvidence(params);
    const manifest = buildReaderSummaryRecoveryTerminalManifest({
      requestedUtcDate: params.requestedUtcDate,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      databaseIdentity,
      sourceDumpSha256: source.sha256,
      excludedFeedItemIds: params.excludedFeedItemIds,
      rows,
    });
    source.assertUnchanged();
    const replayDatabaseIdentity = await readVerifiedDatabaseIdentity(
      params.client,
      params.expectedDatabaseIdentity,
    );
    if (replayDatabaseIdentity !== databaseIdentity) {
      throw new Error(
        "Reader summary recovery terminal manifest scratch database " +
          "identity changed during extraction",
      );
    }
    source.assertUnchanged();
    return publishReaderSummaryRecoveryTerminalManifest({
      outputPath: params.outputPath,
      manifest,
      filesystemCheckpoint: params.filesystemCheckpoint,
    });
  } finally {
    source.close();
  }
};

export const buildRecoveryTerminalManifest = async (
  options: RecoveryTerminalManifestOptions,
  scratchDatabaseUrl: string,
) => {
  assertExplicitScratchDatabaseUrl(scratchDatabaseUrl);
  const pool = new Pool({
    connectionString: scratchDatabaseUrl,
    application_name: "reader-summary-recovery-terminal-manifest",
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 120_000,
  });
  const connection = await pool.connect();
  const client: RecoveryTerminalManifestQueryClient = {
    query: async <TRow extends Readonly<Record<string, unknown>>>(
      sql: string,
      values: readonly unknown[] = [],
    ) => {
      const result = await connection.query<TRow>(sql, [...values]);
      return { rows: result.rows };
    },
  };
  try {
    await connection.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    try {
      const result = await extractReaderSummaryRecoveryTerminalManifest({
        client,
        ...options,
      });
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    connection.release();
    await pool.end().catch(() => undefined);
  }
};

const readVerifiedDatabaseIdentity = async (
  client: RecoveryTerminalManifestQueryClient,
  expectedIdentity: string,
): Promise<string> => {
  if (!/^postgres-scratch-sha256:[0-9a-f]{64}$/u.test(expectedIdentity)) {
    throw new Error(
      "Reader summary recovery terminal manifest scratch database " +
        "identity is malformed",
    );
  }
  const result = await client.query<RecoveryTerminalManifestDatabaseRow>(
    recoveryTerminalManifestDatabaseIdentitySql,
  );
  assertReaderSummaryWeeklyDenseArray(
    result.rows,
    "terminal manifest database identity rows",
  );
  if (result.rows.length !== 1 || result.rows[0] === undefined) {
    throw new Error(
      "Reader summary recovery terminal manifest scratch database " +
        "identity is ambiguous",
    );
  }
  const identity = deriveRecoveryTerminalDatabaseIdentity(result.rows[0]);
  if (identity !== expectedIdentity) {
    throw new Error(
      "Reader summary recovery terminal manifest scratch database " +
        "identity diverged",
    );
  }
  return identity;
};

const readRecoveryTerminalEvidence = async (params: {
  readonly client: RecoveryTerminalManifestQueryClient;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
}): Promise<readonly RecoveryTerminalManifestEvidenceRow[]> => {
  const tenantId = exactUuid(params.tenantId, "tenant id");
  const workspaceId = exactUuid(params.workspaceId, "workspace id");
  const period = exactUtcPeriod(params.requestedUtcDate);
  const result =
    await params.client.query<RecoveryTerminalManifestEvidenceRow>(
      recoveryTerminalManifestEvidenceSql,
      [tenantId, workspaceId, period.startedAt, period.endedAt],
    );
  assertReaderSummaryWeeklyDenseArray(
    result.rows,
    "terminal manifest database rows",
  );
  return result.rows;
};

const main = async (): Promise<void> => {
  const options = parseRecoveryTerminalManifestOptions(
    process.argv.slice(2),
  );
  const scratchDatabaseUrl =
    process.env[recoveryTerminalScratchDatabaseUrlEnvironmentName]?.trim();
  if (scratchDatabaseUrl === undefined || scratchDatabaseUrl.length === 0) {
    throw new Error(
      `${recoveryTerminalScratchDatabaseUrlEnvironmentName} is absent`,
    );
  }
  const result = await buildRecoveryTerminalManifest(
    options,
    scratchDatabaseUrl,
  );
  console.log(
    `Recovery terminal manifest ${result.outcome}: ` +
      `date=${result.manifest.requestedUtcDate} ` +
      `leaves=${result.manifest.leafCount} ` +
      `rootSha256=${result.manifest.rootSha256}`,
  );
};

const single = (
  values: ReadonlyMap<string, readonly string[]>,
  name: string,
): string => {
  const found = values.get(name) ?? [];
  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(`${name} must be provided exactly once`);
  }
  return found[0];
};

const assertExplicitScratchDatabaseUrl = (value: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Scratch PostgreSQL database URL is malformed");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname.length === 0 ||
    parsed.pathname.length <= 1
  ) {
    throw new Error("Scratch PostgreSQL database URL is malformed");
  }
};

const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const exactUuid = (input: string, label: string): string => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      input,
    )
  ) {
    throw new Error(
      `Reader summary recovery terminal manifest ${label} is malformed`,
    );
  }
  return input;
};

const exactUtcPeriod = (
  input: string,
): Readonly<{ startedAt: string; endedAt: string }> => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    throw new Error(
      "Reader summary recovery terminal manifest UTC date is malformed",
    );
  }
  const startedAt = `${input}T00:00:00.000Z`;
  const started = new Date(startedAt);
  if (
    !Number.isFinite(started.getTime()) ||
    started.toISOString() !== startedAt
  ) {
    throw new Error(
      "Reader summary recovery terminal manifest UTC date is malformed",
    );
  }
  return Object.freeze({
    startedAt,
    endedAt: new Date(started.getTime() + 86_400_000).toISOString(),
  });
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Recovery terminal manifest extraction failed",
    );
    process.exitCode = 1;
  });
}
