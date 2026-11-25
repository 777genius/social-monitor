import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { PoolClient } from "pg";
import { PrismaReaderSummaryWeeklyProjectionReader } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-projection.reader";
import type { PrismaSummaryClient } from "../../libs/summary/adapters/persistence/prisma/prisma-summary-client";
import {
  assertPostgres as assert,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";

const weekStartedOn = "2026-06-01";
const weekEndedOn = "2026-06-07";

export const assertReaderSummaryWeeklyProjectionPostgresContract = async (
  client: PoolClient,
): Promise<void> => {
  const version = await client.query<{ server_version_num: string }>(
    "SHOW server_version_num",
  );
  assert(
    /^18[0-9]{4}$/u.test(version.rows[0]?.server_version_num ?? ""),
    "reader summary weekly projection requires PostgreSQL 18",
  );
  const timeZone = await client.query<{ time_zone: string }>(
    "SELECT current_setting('TimeZone') AS time_zone",
  );
  const originalTimeZone = timeZone.rows[0]?.time_zone;
  assert(
    typeof originalTimeZone === "string" && originalTimeZone.length > 0,
    "projection must read the PostgreSQL session time zone",
  );
  await client.query(
    "SELECT set_config('TimeZone', 'America/Los_Angeles', false)",
  );
  try {
    const prisma = prismaRawClient(client);
    const reader = new PrismaReaderSummaryWeeklyProjectionReader(prisma);
    const projection = await reader.read({
      tenantId: tenantId(readerSummaryPublicationFixtureScope.tenantId),
      workspaceId: workspaceId(readerSummaryPublicationFixtureScope.workspaceId),
      weekStartedOn,
      weekEndedOn,
    });
    assert(
      projection.certifiedDailyEvidenceDates.length === 7 &&
        projection.certifiedDailyEvidenceDates[0] === weekStartedOn &&
        projection.certifiedDailyEvidenceDates[6] === weekEndedOn,
      "projection must read exact Monday-Sunday certified evidence in America/Los_Angeles",
    );
    assert(
      projection.activeWeeklyCertifiedArtifactPresent &&
        projection.artifact !== null &&
        projection.artifact.proof.weekStartedOn === weekStartedOn &&
        projection.artifact.proof.weekEndedOn === weekEndedOn &&
        projection.artifact.artifact.output.sealId ===
          projection.artifact.proof.modelInputSealId &&
        projection.artifact.artifact.output.sealSha ===
          projection.artifact.proof.modelInputSealSha256,
      "projection must return one strict active WEEKLY_CERTIFIED artifact",
    );
    assert(
      JSON.stringify(projection.evidenceLimitations) === JSON.stringify([
        {
          requestedUtcDate: "2026-06-01",
          providerKey: "github-trending-page",
          evidenceState: "historical_unavailable",
        },
        {
          requestedUtcDate: "2026-06-03",
          providerKey: "github-trending-page",
          evidenceState: "historical_unavailable",
        },
        {
          requestedUtcDate: "2026-06-05",
          providerKey: "github-trending-page",
          evidenceState: "historical_unavailable",
        },
        {
          requestedUtcDate: "2026-06-07",
          providerKey: "github-trending-page",
          evidenceState: "historical_unavailable",
        },
      ]),
      "projection must expose the exact ordered historical fixture limitations",
    );

    await assertJuneSecondRetainedEvidenceAndSealSelection(client);

    const currentBeforeRevision = await currentDailyPublicationId(
      client,
      "2026-06-02",
    );
    const revision = await createReaderSummaryPublicationRunningFixture(
      client,
      "COMPLETED",
      "2026-06-02",
      {
        githubEvidenceMode: "verified",
        requestedAt: "2026-06-02T11:00:00.000Z",
        modelVersion: "codex:gpt-5.5:xhigh:post-weekly-revision",
      },
    );
    const published = await client.query<{ outcome: string }>(
      "SELECT outcome FROM publish_reader_summary($1::jsonb)",
      [JSON.stringify(revision.payload)],
    );
    assert(
      published.rows[0]?.outcome === "published",
      "later June-02 daily revision must publish after the first weekly projection",
    );
    const currentAfterRevision = await currentDailyPublicationId(
      client,
      "2026-06-02",
    );
    assert(
      currentBeforeRevision !== currentAfterRevision &&
        currentAfterRevision === revision.artifactId,
      "later June-02 revision must replace the current daily slot",
    );
    await assertRejectsContaining(
      () => reader.read({
        tenantId: tenantId(readerSummaryPublicationFixtureScope.tenantId),
        workspaceId: workspaceId(
          readerSummaryPublicationFixtureScope.workspaceId,
        ),
        weekStartedOn,
        weekEndedOn,
      }),
      "sealed and current daily authorities diverged",
      "already-published weekly artifact must reject after a current daily authority revision",
    );

    const isolated = await reader.read({
      tenantId: tenantId(readerSummaryPublicationFixtureScope.tenantId),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000099"),
      weekStartedOn,
      weekEndedOn,
    });
    assert(
      isolated.certifiedDailyEvidenceDates.length === 0 &&
        !isolated.activeWeeklyCertifiedArtifactPresent &&
        isolated.evidenceLimitations.length === 0 &&
        isolated.artifact === null,
      "projection must enforce tenant/workspace isolation",
    );
  } finally {
    await client.query("SELECT set_config('TimeZone', $1, false)", [
      originalTimeZone,
    ]);
  }
};

const assertJuneSecondRetainedEvidenceAndSealSelection = async (
  client: PoolClient,
): Promise<void> => {
  const result = await client.query<{
    readonly current_publication_id: string;
    readonly current_verified_count: string;
    readonly current_verified_publication_id: string;
    readonly historical_unavailable_count: string;
    readonly retained_count: string;
    readonly sealed_publication_id: string;
    readonly sealed_current_count: string;
  }>(
    `SELECT
       count(*)::TEXT AS retained_count,
       max(daily_slot.current_publication_id::TEXT) AS current_publication_id,
       count(*) FILTER (
         WHERE evidence.github_evidence->>'mode' = 'historical_unavailable'
       )::TEXT AS historical_unavailable_count,
       count(*) FILTER (
         WHERE evidence.publication_id = daily_slot.current_publication_id
           AND evidence.github_evidence->>'mode' = 'verified'
       )::TEXT AS current_verified_count,
       max(evidence.publication_id::TEXT) FILTER (
         WHERE evidence.publication_id = daily_slot.current_publication_id
           AND evidence.github_evidence->>'mode' = 'verified'
       ) AS current_verified_publication_id,
       max(seal_day.value->>'publicationId') AS sealed_publication_id,
       count(*) FILTER (
         WHERE evidence.publication_id = daily_slot.current_publication_id
           AND seal_day.value->>'publicationId' =
             daily_slot.current_publication_id::TEXT
       )::TEXT AS sealed_current_count
     FROM reader_summary_weekly_publication_evidence AS evidence
     JOIN reader_summary_publication_slots AS daily_slot
       ON daily_slot.tenant_id = evidence.tenant_id
      AND daily_slot.workspace_id = evidence.workspace_id
      AND daily_slot.scope_type = evidence.scope_type
      AND daily_slot.scope_key = evidence.scope_key
      AND daily_slot.cadence = evidence.cadence
      AND daily_slot.period_started_at = evidence.period_started_at
      AND daily_slot.period_ended_at = evidence.period_ended_at
      AND daily_slot.period_timezone = evidence.period_timezone
     JOIN reader_summary_weekly_certification_seals AS seal
       ON seal.tenant_id = evidence.tenant_id
      AND seal.workspace_id = evidence.workspace_id
      AND seal.scope_type = evidence.scope_type
      AND seal.scope_key = evidence.scope_key
      AND seal.week_started_on = $3::DATE
     JOIN LATERAL jsonb_array_elements(seal.days) AS seal_day(value)
       ON seal_day.value->>'requestedUtcDate' =
         evidence.requested_utc_date::TEXT
    WHERE evidence.tenant_id = $1::UUID
      AND evidence.workspace_id = $2::UUID
      AND evidence.scope_type = 'workspace'
      AND evidence.scope_key = 'workspace'
      AND evidence.cadence = 'daily'
      AND evidence.requested_utc_date = '2026-06-02'::DATE`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      weekStartedOn,
    ],
  );
  const row = result.rows[0];
  assert(
    row?.retained_count === "2" &&
      row.historical_unavailable_count === "1" &&
      row.current_verified_count === "1" &&
      row.sealed_current_count === "1" &&
      row.current_publication_id === row.current_verified_publication_id &&
      row.sealed_publication_id === row.current_publication_id,
    "June-02 must retain historical and current evidence while the seal selects exactly the current verified publication",
  );
};

const prismaRawClient = (
  client: PoolClient,
): PrismaSummaryClient => ({
  $queryRaw: async <T>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T> => {
    const sql = strings.reduce(
      (result, part, index) =>
        `${result}${part}${index < values.length ? `$${index + 1}` : ""}`,
      "",
    );
    const result = await client.query(sql, [...values]);
    return result.rows.map(prismaDateColumns) as T;
  },
}) as unknown as PrismaSummaryClient;

const currentDailyPublicationId = async (
  client: PoolClient,
  requestedUtcDate: string,
): Promise<string> => {
  const result = await client.query<{ current_publication_id: string }>(
    `SELECT slot.current_publication_id::TEXT AS current_publication_id
       FROM reader_summary_publication_slots AS slot
      WHERE slot.tenant_id = $1::UUID
        AND slot.workspace_id = $2::UUID
        AND slot.scope_type = 'workspace'
        AND slot.scope_key = 'workspace'
        AND slot.cadence = 'daily'
        AND slot.period_started_at = (
          $3::DATE::TIMESTAMP AT TIME ZONE 'UTC'
        )
        AND slot.period_ended_at = (
          (($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC')
        )
        AND slot.period_timezone = 'UTC'`,
    [
      readerSummaryPublicationFixtureScope.tenantId,
      readerSummaryPublicationFixtureScope.workspaceId,
      requestedUtcDate,
    ],
  );
  const publicationId = result.rows[0]?.current_publication_id;
  assert(
    typeof publicationId === "string" && publicationId.length > 0,
    `current ${requestedUtcDate} daily slot must exist`,
  );
  return publicationId;
};

export const prismaDateColumns = <TRow extends Record<string, unknown>>(
  row: TRow,
): TRow => {
  const result = { ...row };
  for (const key of ["requestedUtcDate", "weekStartedOn", "weekEndedOn"]) {
    const value = result[key];
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      result[key as keyof TRow] = new Date(Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
      )) as TRow[keyof TRow];
    } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      result[key as keyof TRow] = new Date(
        `${value}T00:00:00.000Z`,
      ) as TRow[keyof TRow];
    }
  }
  return result;
};
