import type { PoolClient } from "pg";

import {
  readerSummaryPublicationDbOwnedRequest,
  type EvidenceFixtureOverrides,
  type ReaderSummaryPublicationEvidenceFixture,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";

type BackfillRow = Readonly<{
  requested_utc_date: string;
  publication_id: string;
  outcome: string;
  identity: string;
  canonical_sha256: string;
}>;

type CreateFixture = (
  status: "COMPLETED" | "NO_SIGNAL",
  date: string,
  overrides?: EvidenceFixtureOverrides,
) => Promise<ReaderSummaryPublicationEvidenceFixture>;

export const assertReaderSummaryWeeklyDailyCertificationBackfillPostgresContract =
  async (params: {
    readonly canonicalJsonAuditor: PoolClient;
    readonly client: PoolClient;
    readonly concurrentClient: PoolClient;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly createFixture: CreateFixture;
    readonly publish: (
      payload: Readonly<Record<string, unknown>>,
    ) => Promise<string>;
  }): Promise<void> => {
    await assertDirectMisuseAndSessionForgery(params);
    await assertHistoricalAuthorizationGuards(params);

    await publishWeek(
      params,
      "2026-07-06",
      {},
      7,
      completedVerifiedDay,
    );
    const beforeReplay = await evidenceSnapshot(
      params.client,
      "2026-07-06",
    );
    const arbitrary = await backfill(params, "2026-07-06");
    assertExactReplay(arbitrary, "2026-07-06");
    assertDeepEqual(
      await evidenceSnapshot(params.client, "2026-07-06"),
      beforeReplay,
      "weekly backfill replay must perform zero durable evidence writes",
    );
    await assertVerifiedWeekAuthority(params.client, "2026-07-06");
    const concurrent = await Promise.all([
      backfill(params, "2026-07-06"),
      backfill(
        { ...params, client: params.concurrentClient },
        "2026-07-06",
      ),
    ]);
    concurrent.forEach((rows) =>
      assertExactReplay(rows, "2026-07-06"),
    );
    assertDeepEqual(
      await evidenceSnapshot(params.client, "2026-07-06"),
      beforeReplay,
      "concurrent backfill replays must perform zero durable evidence writes",
    );

    await publishWeek(
      params,
      "2026-07-20",
      {
        "2026-07-23": {
          status: "COMPLETED",
          overrides: { githubEvidenceMode: "historical_unavailable" },
        },
        "2026-07-26": {
          status: "NO_SIGNAL",
          overrides: { githubEvidenceMode: "ordinary_not_required" },
        },
      },
      7,
      completedVerifiedDay,
    );
    const grandfathered = await backfill(params, "2026-07-20");
    assertExactReplay(grandfathered, "2026-07-20");
    await assertHistoricalAuthority(params.canonicalJsonAuditor);
    await assertNoSignalAuthority(params.client, "2026-07-26");

    await publishWeek(params, "2026-07-13", {
      "2026-07-13": {
        status: "COMPLETED",
        overrides: { githubEvidenceMode: "verified" },
      },
      "2026-07-16": {
        status: "COMPLETED",
        overrides: { githubEvidenceMode: "historical_unavailable" },
      },
    });
    await assertRejects(
      () => backfill(params, "2026-07-13"),
      "completed authority diverged",
      "historical GitHub omission on the wrong date must fail closed",
    );

    await publishWeek(params, "2026-05-04", {}, 6);
    await assertRejects(
      () => backfill(params, "2026-05-04"),
      "requires seven immutable daily publications",
      "a partial Monday-Sunday week must fail closed",
    );
    await assertMissingDayNotFabricated(
      params.client,
      "2026-05-10",
    );

    await assertRejects(
      () => backfill(params, "2026-07-20", "interest:forged"),
      "scope is invalid",
      "a forged scope key must fail closed",
    );
  };

const completedVerifiedDay = Object.freeze({
  status: "COMPLETED" as const,
  overrides: Object.freeze({ githubEvidenceMode: "verified" as const }),
});

type DayOverride = Readonly<{
  status: "COMPLETED" | "NO_SIGNAL";
  overrides?: EvidenceFixtureOverrides;
}>;

const publishWeek = async (
  params: {
    readonly createFixture: CreateFixture;
    readonly publish: (
      payload: Readonly<Record<string, unknown>>,
    ) => Promise<string>;
  },
  weekStartedOn: string,
  overrides: Readonly<Record<string, DayOverride>>,
  length = 7,
  defaultDay: DayOverride = Object.freeze({
    status: "NO_SIGNAL" as const,
    overrides: Object.freeze({
      githubEvidenceMode: "ordinary_not_required" as const,
    }),
  }),
): Promise<void> => {
  for (const date of datesFrom(weekStartedOn).slice(0, length)) {
    const day = overrides[date] ?? defaultDay;
    const fixture = await params.createFixture(
      day.status,
      date,
      day.overrides,
    );
    const outcome = await params.publish(
      readerSummaryPublicationDbOwnedRequest(fixture),
    );
    assert(
      outcome === "published",
      `daily fixture ${date} must publish before weekly backfill`,
    );
  }
};

const assertDirectMisuseAndSessionForgery = async (params: {
  readonly client: PoolClient;
  readonly tenantId: string;
  readonly workspaceId: string;
}): Promise<void> => {
  await assertRejects(
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "writable SERIALIZABLE tenant session",
    "a direct READ COMMITTED backfill call must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => undefined,
    () =>
      invokeBackfill(
        params.client,
        "00000000-0000-7000-8000-000000000071",
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "session scope diverged",
    "a cross-tenant function argument must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => undefined,
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        "00000000-0000-7000-8000-000000000072",
        "workspace",
        "2026-07-06",
      ),
    "session scope diverged",
    "a cross-workspace function argument must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => {
      await params.client.query(
        `SELECT set_config(
           'social_monitor.system_access',
           'true',
           true
         )`,
      );
    },
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "writable SERIALIZABLE tenant session",
    "a forged system session must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => {
      await params.client.query(
        `SELECT set_config('social_monitor.tenant_id', '', true)`,
      );
    },
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "session scope diverged",
    "a missing tenant session scope must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => {
      await params.client.query(
        `SELECT set_config(
           'social_monitor.tenant_id',
           ' ' || $1::text || ' ',
           true
         )`,
        [params.tenantId],
      );
    },
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "session scope diverged",
    "a non-canonical tenant GUC must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => {
      await params.client.query(
        `SELECT set_config('social_monitor.workspace_id', '', true)`,
      );
    },
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-06",
      ),
    "session scope diverged",
    "a missing workspace session scope must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => undefined,
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2026-07-07",
      ),
    "completed Monday-Sunday UTC week",
    "a non-Monday window must fail closed",
  );
  await assertRejectedSerializableTransaction(
    params.client,
    async () => undefined,
    () =>
      invokeBackfill(
        params.client,
        params.tenantId,
        params.workspaceId,
        "workspace",
        "2099-01-05",
      ),
    "completed Monday-Sunday UTC week",
    "a future window must fail closed",
  );
};

const assertHistoricalAuthorizationGuards = async (params: {
  readonly client: PoolClient;
  readonly createFixture: CreateFixture;
  readonly publish: (
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<string>;
}): Promise<void> => {
  const blankReason = await params.createFixture(
    "COMPLETED",
    "2026-07-01",
    { githubEvidenceMode: "historical_unavailable" },
  );
  await params.client.query(
    `UPDATE reader_summary_artifacts
        SET quality_signals = jsonb_set(
          quality_signals,
          '{githubProjectionAudit,historicalOmission,reason}',
          '""'::jsonb
        )
      WHERE id = $1::uuid`,
    [blankReason.artifactId],
  );
  await assertRejects(
    () =>
      params.publish(
        readerSummaryPublicationDbOwnedRequest(blankReason),
      ),
    "historical GitHub authorization is not exact",
    "blank historical authorization reason must fail closed",
  );

  const earlyAuthorization = await params.createFixture(
    "COMPLETED",
    "2026-07-02",
    { githubEvidenceMode: "historical_unavailable" },
  );
  await params.client.query(
    `UPDATE reader_summary_artifacts
        SET quality_signals = jsonb_set(
          quality_signals,
          '{githubProjectionAudit,historicalOmission,authorizedAt}',
          to_jsonb('2026-07-02T23:59:59.999Z'::text)
        )
      WHERE id = $1::uuid`,
    [earlyAuthorization.artifactId],
  );
  await assertRejects(
    () =>
      params.publish(
        readerSummaryPublicationDbOwnedRequest(earlyAuthorization),
      ),
    "historical GitHub authorization is not exact",
    "early historical authorization timestamp must fail closed",
  );
};

const backfill = async (
  params: {
    readonly client: PoolClient;
    readonly tenantId: string;
    readonly workspaceId: string;
  },
  weekStartedOn: string,
  scopeKey = "workspace",
): Promise<readonly BackfillRow[]> => {
  await params.client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    const rows = await invokeBackfill(
      params.client,
      params.tenantId,
      params.workspaceId,
      scopeKey,
      weekStartedOn,
    );
    await assertNoStrongTableLocks(params.client);
    await params.client.query("COMMIT");
    return rows;
  } catch (error: unknown) {
    await params.client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const invokeBackfill = async (
  client: PoolClient,
  tenantId: string,
  workspaceId: string,
  scopeKey: string,
  weekStartedOn: string,
): Promise<readonly BackfillRow[]> => {
  const result = await client.query<BackfillRow>(
    `SELECT
       to_char(requested_utc_date, 'YYYY-MM-DD') AS requested_utc_date,
       publication_id::text,
       outcome,
       identity,
       btrim(canonical_sha256) AS canonical_sha256
     FROM backfill_reader_summary_weekly_daily_certifications(
       $1::uuid, $2::uuid, 'workspace', $3::text, $4::date
     )
     ORDER BY requested_utc_date`,
    [tenantId, workspaceId, scopeKey, weekStartedOn],
  );
  return result.rows;
};

const assertNoStrongTableLocks = async (
  client: PoolClient,
): Promise<void> => {
  const result = await client.query<{
    readonly mode: string;
    readonly relation_name: string;
  }>(
    `SELECT lock.mode, lock.relation::regclass::text AS relation_name
       FROM pg_catalog.pg_locks AS lock
      WHERE lock.pid = pg_catalog.pg_backend_pid()
        AND lock.locktype = 'relation'
        AND lock.granted
        AND lock.mode = ANY($1::text[])
        AND lock.relation = ANY(ARRAY[
          'public.reader_summary_publication_slots'::regclass,
          'public.reader_summary_publications'::regclass,
          'public.reader_summary_weekly_publication_evidence'::regclass
        ])
      ORDER BY relation_name, lock.mode`,
    [
      [
        "ShareLock",
        "ShareRowExclusiveLock",
        "ExclusiveLock",
        "AccessExclusiveLock",
      ],
    ],
  );
  assertDeepEqual(
    result.rows,
    [],
    "weekly backfill must not acquire strong table locks",
  );
};

const assertMissingDayNotFabricated = async (
  client: PoolClient,
  date: string,
): Promise<void> => {
  const result = await client.query<{
    readonly evidence: string;
    readonly publications: string;
    readonly slots: string;
  }>(
    `SELECT
       (
         SELECT count(*)::text
           FROM reader_summary_publication_slots
          WHERE period_started_at =
            ($1::date::timestamp AT TIME ZONE 'UTC')
       ) AS slots,
       (
         SELECT count(*)::text
           FROM reader_summary_publications
          WHERE requested_utc_date = $1::date
       ) AS publications,
       (
         SELECT count(*)::text
           FROM reader_summary_weekly_publication_evidence
          WHERE requested_utc_date = $1::date
       ) AS evidence`,
    [date],
  );
  assertDeepEqual(
    result.rows[0],
    { slots: "0", publications: "0", evidence: "0" },
    "weekly backfill must not fabricate a missing daily authority",
  );
};

const assertRejectedSerializableTransaction = async (
  client: PoolClient,
  arrange: () => Promise<void>,
  operation: () => Promise<unknown>,
  expectedMessage: string,
  assertionMessage: string,
): Promise<void> => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await arrange();
    await operation();
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      assertionMessage,
    );
    return;
  }
  await client.query("ROLLBACK").catch(() => undefined);
  throw new Error(assertionMessage);
};

const assertExactReplay = (
  rows: readonly BackfillRow[],
  weekStartedOn: string,
): void => {
  const dates = datesFrom(weekStartedOn);
  assert(rows.length === 7, "weekly backfill must return exactly seven rows");
  rows.forEach((row, index) => {
    assert(
      row.requested_utc_date === dates[index] &&
        row.outcome === "replayed" &&
        row.identity ===
          `reader_summary.weekly_publication_evidence.v1:${row.canonical_sha256}` &&
        /^[0-9a-f]{64}$/u.test(row.canonical_sha256),
      "weekly backfill replay order or canonical seal diverged",
    );
  });
};

const evidenceSnapshot = async (
  client: PoolClient,
  weekStartedOn: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> => {
  const result = await client.query(
    `SELECT
       publication_id::text,
       xmin::text,
       identity,
       btrim(canonical_sha256) AS canonical_sha256,
       encode(canonical_bytes, 'hex') AS canonical_bytes
     FROM reader_summary_weekly_publication_evidence
     WHERE requested_utc_date BETWEEN $1::date AND $1::date + 6
     ORDER BY requested_utc_date`,
    [weekStartedOn],
  );
  return result.rows;
};

const assertVerifiedWeekAuthority = async (
  client: PoolClient,
  weekStartedOn: string,
): Promise<void> => {
  const result = await client.query<{
    readonly github_count: string;
    readonly github_evidence_count: string;
    readonly mode: string;
    readonly provider_github_count: string;
    readonly repository_count: string;
    readonly semantic_status: string;
  }>(
    `SELECT
       semantic_status::text,
       github_evidence->>'mode' AS mode,
       github_evidence->>'evidenceCount' AS github_evidence_count,
       jsonb_array_length(github_evidence->'repositories')::text
         AS repository_count,
       (
         SELECT provider_count->>'count'
         FROM jsonb_array_elements(
           canonical_record->'providerCounts'
         ) AS provider_count
         WHERE provider_count->>'providerKey' = 'github-trending-page'
       ) AS github_count,
       (
         SELECT count(*)::text
         FROM jsonb_array_elements(provider_evidence) AS provider
         WHERE provider->>'providerKey' = 'github-trending-page'
       ) AS provider_github_count
     FROM reader_summary_weekly_publication_evidence
     WHERE requested_utc_date BETWEEN $1::date AND $1::date + 6
     ORDER BY requested_utc_date`,
    [weekStartedOn],
  );
  assert(result.rows.length === 7, "verified week must contain seven rows");
  result.rows.forEach((row) =>
    assertDeepEqual(
      row,
      {
        semantic_status: "COMPLETED",
        mode: "verified",
        github_evidence_count: "10",
        repository_count: "10",
        github_count: "10",
        provider_github_count: "10",
      },
      "ordinary COMPLETED day must retain exact GitHub10 authority",
    ),
  );
};

const assertHistoricalAuthority = async (
  client: PoolClient,
): Promise<void> => {
  const result = await client.query<{
    readonly github_count: string;
    readonly github_evidence_count: string;
    readonly mode: string;
    readonly authorization_valid: boolean;
    readonly reason_valid: boolean;
    readonly repository_count: string;
    readonly seal_valid: boolean;
    readonly semantic_status: string;
  }>(
    `SELECT
       semantic_status::text,
       github_evidence->>'mode' AS mode,
       github_evidence->>'evidenceCount' AS github_evidence_count,
       github_evidence->>'historicalUnavailableReason' =
         btrim(github_evidence->>'historicalUnavailableReason')
         AND length(
           github_evidence->>'historicalUnavailableReason'
         ) BETWEEN 1 AND 4096 AS reason_valid,
       (github_evidence->>'authorizedAt')::timestamptz >=
         period_ended_at AS authorization_valid,
       jsonb_array_length(github_evidence->'repositories')::text
         AS repository_count,
       (
         SELECT provider_count->>'count'
         FROM jsonb_array_elements(
           canonical_record->'providerCounts'
         ) AS provider_count
         WHERE provider_count->>'providerKey' = 'github-trending-page'
       ) AS github_count,
       github_evidence->>'sha256' = encode(
         sha256(convert_to(
           reader_summary_weekly_canonical_json(
             github_evidence - 'sha256'
           ),
           'UTF8'
         )),
         'hex'
       ) AS seal_valid
     FROM reader_summary_weekly_publication_evidence
     WHERE requested_utc_date = DATE '2026-07-23'`,
  );
  assert(
    JSON.stringify(result.rows[0]) ===
      JSON.stringify({
        semantic_status: "COMPLETED",
        mode: "historical_unavailable",
        github_evidence_count: "0",
        reason_valid: true,
        authorization_valid: true,
        repository_count: "0",
        github_count: "0",
        seal_valid: true,
      }),
    "Jul 23 historical exception must retain exact DB-owned zero GitHub authority",
  );
};

const assertNoSignalAuthority = async (
  client: PoolClient,
  date: string,
): Promise<void> => {
  const result = await client.query<{
    readonly github_count: string;
    readonly github_evidence_count: string;
    readonly mode: string;
    readonly provider_evidence_count: string;
    readonly repository_count: string;
    readonly semantic_status: string;
  }>(
    `SELECT
       semantic_status::text,
       github_evidence->>'mode' AS mode,
       github_evidence->>'evidenceCount' AS github_evidence_count,
       jsonb_array_length(github_evidence->'repositories')::text
         AS repository_count,
       (
         SELECT provider_count->>'count'
         FROM jsonb_array_elements(
           canonical_record->'providerCounts'
         ) AS provider_count
         WHERE provider_count->>'providerKey' = 'github-trending-page'
       ) AS github_count,
       jsonb_array_length(provider_evidence)::text
         AS provider_evidence_count
     FROM reader_summary_weekly_publication_evidence
     WHERE requested_utc_date = $1::date`,
    [date],
  );
  assert(
    JSON.stringify(result.rows[0]) ===
      JSON.stringify({
        semantic_status: "NO_SIGNAL",
        mode: "ordinary_not_required",
        github_evidence_count: "0",
        repository_count: "0",
        github_count: "0",
        provider_evidence_count: "0",
      }),
    "NO_SIGNAL must retain the ordinary zero-evidence contract",
  );
};

const datesFrom = (weekStartedOn: string): readonly string[] => {
  const startedAt = Date.parse(`${weekStartedOn}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) =>
    new Date(startedAt + index * 86_400_000).toISOString().slice(0, 10),
  );
};

const assertRejects = async (
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

const assert: (
  condition: boolean,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};
