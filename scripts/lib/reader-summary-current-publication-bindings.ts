import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { PrismaReaderSummaryArtifactRecord } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import type {
  ReaderSummaryMultiDayActualDay,
  ReaderSummaryMultiDayGenerationProfile,
} from "@social-monitor/summary/domain";

import { actualDayAndProjectionFromRecord } from "./reader-summary-multi-day-actual-day";
import type {
  TargetManifestScopeV3,
  TargetManifestV3,
  TargetManifestV3Target,
} from "./reader-summary-multi-day-target-manifest";
import {
  canonicalJson,
  canonicalJsonSha256,
  dailyPeriodKey,
} from "./reader-summary-quality-eval-support";

export const currentPublicArtifactBindingsQuery = `
  with requested_days as (
    select requested_date
    from unnest($4::date[]) as requested(requested_date)
  )
  select
    requested_days.requested_date::text as "collectionDate",
    publication.id::text as "publicationId",
    publication.report_sha256::text as "reportSha256",
    publication.proof_sha256::text as "proofSha256",
    publication.exact_proof as "exactProof",
    publication.requested_utc_date::text as "publicationRequestedUtcDate",
    publication.requested_at as "publicationRequestedAt",
    publication.reader_summary_job_id::text as "publicationReaderSummaryJobId",
    artifact.id::text as "id",
    artifact.tenant_id::text as "tenantId",
    artifact.workspace_id::text as "workspaceId",
    artifact.scope_type as "scopeType",
    artifact.scope_key as "scopeKey",
    artifact.interest_id::text as "interestId",
    artifact.cadence as "cadence",
    artifact.period_started_at as "periodStartedAt",
    artifact.period_ended_at as "periodEndedAt",
    artifact.period_timezone as "periodTimezone",
    artifact.period_key as "periodKey",
    artifact.user_id::text as "userId",
    artifact.subscription_id::text as "subscriptionId",
    artifact.status::text as "status",
    artifact.schema_version as "schemaVersion",
    artifact.model_version as "modelVersion",
    artifact.prompt_version as "promptVersion",
    artifact.headline as "headline",
    artifact.summary_text as "summaryText",
    artifact.artifact_payload as "artifactPayload",
    artifact.citations as "citations",
    artifact.quality_signals as "qualitySignals",
    artifact.created_at as "createdAt",
    artifact.updated_at as "updatedAt"
  from requested_days
  join reader_summary_publication_slots slot
    on slot.tenant_id = $1::uuid
    and slot.workspace_id = $2::uuid
    and slot.scope_type = 'workspace'
    and slot.scope_key = $3
    and slot.cadence = 'daily'
    and slot.period_started_at = requested_days.requested_date::timestamp at time zone 'UTC'
    and slot.period_ended_at = (requested_days.requested_date + 1)::timestamp at time zone 'UTC'
    and slot.period_timezone = 'UTC'
    and slot.current_publication_id is not null
  join reader_summary_publications publication
    on publication.id = slot.current_publication_id
    and publication.tenant_id = slot.tenant_id
    and publication.workspace_id = slot.workspace_id
    and publication.scope_type = slot.scope_type
    and publication.scope_key = slot.scope_key
    and publication.cadence = slot.cadence
    and publication.period_started_at = slot.period_started_at
    and publication.period_ended_at = slot.period_ended_at
    and publication.period_timezone = slot.period_timezone
    and publication.publication_kind = 'EXACT'
    and publication.semantic_status = 'COMPLETED'
  join reader_summary_artifacts artifact
    on artifact.id = publication.reader_summary_artifact_id
    and artifact.tenant_id = publication.tenant_id
    and artifact.workspace_id = publication.workspace_id
    and artifact.scope_type = publication.scope_type
    and artifact.scope_key = publication.scope_key
    and artifact.cadence = publication.cadence
    and artifact.period_started_at = publication.period_started_at
    and artifact.period_ended_at = publication.period_ended_at
    and artifact.period_timezone = publication.period_timezone
    and artifact.period_key = publication.period_key
    and artifact.status = 'COMPLETED'
    and artifact.model_version = publication.model_version
  order by requested_days.requested_date asc
`;

type CurrentPublicationRow = PrismaReaderSummaryArtifactRecord & {
  readonly collectionDate: string;
  readonly publicationId: string;
  readonly reportSha256: string;
  readonly proofSha256: string;
  readonly exactProof: unknown;
  readonly publicationRequestedUtcDate: string;
  readonly publicationRequestedAt: Date | string;
  readonly publicationReaderSummaryJobId: string;
};

export type CurrentPublicArtifactSnapshot = {
  readonly databaseFingerprint: string;
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly targets: readonly TargetManifestV3Target[];
  readonly actualDays: readonly ReaderSummaryMultiDayActualDay[];
};

export async function readCurrentPublicArtifactSnapshot(params: {
  readonly pool: Pick<Pool, "connect">;
  readonly databaseUrl: string;
  readonly scope: TargetManifestScopeV3;
  readonly collectionDates: readonly string[];
  readonly expectedManifest?: TargetManifestV3;
}): Promise<CurrentPublicArtifactSnapshot> {
  assertSortedDates(params.collectionDates);
  const client = await params.pool.connect();
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    await client.query("SET LOCAL statement_timeout = '60s'");
    const result = await client.query<CurrentPublicationRow>(
      currentPublicArtifactBindingsQuery,
      [
        params.scope.tenantId,
        params.scope.workspaceId,
        params.scope.scopeKey,
        params.collectionDates,
      ],
    );
    const snapshot = buildCurrentPublicArtifactSnapshot({
      rows: result.rows,
      databaseUrl: params.databaseUrl,
      scope: params.scope,
      collectionDates: params.collectionDates,
      expectedManifest: params.expectedManifest,
    });
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function buildCurrentPublicArtifactSnapshot(params: {
  readonly rows: readonly CurrentPublicationRow[];
  readonly databaseUrl: string;
  readonly scope: TargetManifestScopeV3;
  readonly collectionDates: readonly string[];
  readonly expectedManifest?: TargetManifestV3;
}): CurrentPublicArtifactSnapshot {
  if (params.rows.length !== params.collectionDates.length) {
    throw new Error(
      "Current public publication bindings do not cover every requested date",
    );
  }
  const targets: TargetManifestV3Target[] = [];
  const actualDays: ReaderSummaryMultiDayActualDay[] = [];
  for (let index = 0; index < params.collectionDates.length; index += 1) {
    const collectionDate = params.collectionDates[index];
    const row = params.rows[index];
    if (collectionDate === undefined || row?.collectionDate !== collectionDate) {
      throw new Error("Current public publication rows are missing or unsorted");
    }
    assertRowScope(row, params.scope, collectionDate);
    const projection = actualDayAndProjectionFromRecord(collectionDate, row);
    assertPersistedReportHash(row, collectionDate);
    const target: TargetManifestV3Target = {
      collectionDate,
      periodKey: dailyPeriodKey(collectionDate),
      publicationId: row.publicationId,
      artifactId: row.id,
      reportSha256: requiredSha256(row.reportSha256, "reportSha256"),
      proofSha256: requiredSha256(row.proofSha256, "proofSha256"),
      exactProofSha256: canonicalJsonSha256(row.exactProof),
      artifactPayloadSha256: canonicalJsonSha256(row.artifactPayload),
      actualDayProjectionSha256: projection.actualDayProjectionSha256,
    };
    assertExactProofBinding(row, target, params.scope, collectionDate);
    targets.push(target);
    actualDays.push(projection.actualDay);
  }
  const generationProfile = generationProfileFromDays(actualDays);
  if (params.expectedManifest !== undefined) {
    assertExpectedManifestBinding(params.expectedManifest, targets, generationProfile);
  }
  return {
    databaseFingerprint: databaseFingerprintLabel(params.databaseUrl),
    generationProfile,
    targets,
    actualDays,
  };
}

export function databaseFingerprintLabel(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Quality database URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Quality database URL must use PostgreSQL");
  }
  const identity = canonicalJson({
    protocol: "postgresql",
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//u, ""),
  });
  const hash = createHash("sha256").update(identity, "utf8").digest("hex");
  return `postgres-sha256:${hash}`;
}

function assertExpectedManifestBinding(
  manifest: TargetManifestV3,
  targets: readonly TargetManifestV3Target[],
  profile: ReaderSummaryMultiDayGenerationProfile,
): void {
  if (canonicalJson(manifest.generationProfile) !== canonicalJson(profile)) {
    throw new Error("Current public generation profile drifted from target manifest");
  }
  if (canonicalJson(manifest.targets) !== canonicalJson(targets)) {
    throw new Error("Current public artifact bindings drifted from target manifest");
  }
}

function generationProfileFromDays(
  days: readonly ReaderSummaryMultiDayActualDay[],
): ReaderSummaryMultiDayGenerationProfile {
  const first = days[0];
  if (first === undefined) {
    throw new Error("Current public publication snapshot is empty");
  }
  const profile = {
    modelVersion: first.modelVersion,
    promptVersion: first.promptVersion,
    rankingPolicyVersion: first.rankingPolicyVersion,
  };
  for (const day of days) {
    if (
      day.modelVersion !== profile.modelVersion ||
      day.promptVersion !== profile.promptVersion ||
      day.rankingPolicyVersion !== profile.rankingPolicyVersion
    ) {
      throw new Error("Current public artifacts do not use one uniform generation profile");
    }
  }
  return profile;
}

function assertRowScope(
  row: CurrentPublicationRow,
  scope: TargetManifestScopeV3,
  collectionDate: string,
): void {
  if (
    row.tenantId !== scope.tenantId ||
    row.workspaceId !== scope.workspaceId ||
    row.scopeType !== scope.scopeType ||
    row.scopeKey !== scope.scopeKey ||
    row.cadence !== "daily" ||
    row.periodTimezone !== "UTC" ||
    row.periodKey !== dailyPeriodKey(collectionDate) ||
    row.status !== "COMPLETED"
  ) {
    throw new Error(`Current public artifact scope drifted for ${collectionDate}`);
  }
}

function assertExactProofBinding(
  row: CurrentPublicationRow,
  target: TargetManifestV3Target,
  scope: TargetManifestScopeV3,
  collectionDate: string,
): void {
  const proof = row.exactProof;
  if (
    !isRecord(proof) ||
    !hasExactKeys(proof, [
      "schemaVersion",
      "tenantId",
      "workspaceId",
      "scope",
      "period",
      "requestedUtcDate",
      "requestedAt",
      "readerSummaryJobId",
      "readerSummaryArtifactId",
      "semanticStatus",
      "modelVersion",
      "reportSha256",
    ]) ||
    proof.schemaVersion !== "reader_summary.publication_proof.v1" ||
    proof.tenantId !== scope.tenantId ||
    proof.workspaceId !== scope.workspaceId ||
    !isRecord(proof.scope) ||
    !hasExactKeys(proof.scope, ["type", "key"]) ||
    proof.scope.type !== "workspace" ||
    proof.scope.key !== scope.scopeKey ||
    !isRecord(proof.period) ||
    !hasExactKeys(proof.period, [
      "cadence",
      "startedAt",
      "endedAt",
      "timezone",
      "periodKey",
    ]) ||
    proof.period.cadence !== "daily" ||
    proof.period.timezone !== "UTC" ||
    proof.period.periodKey !== target.periodKey ||
    proof.period.startedAt !== `${collectionDate}T00:00:00.000Z` ||
    proof.period.endedAt !== nextUtcDate(collectionDate) ||
    proof.requestedUtcDate !== row.publicationRequestedUtcDate ||
    proof.requestedUtcDate !== exactTimestamp(row.publicationRequestedAt).slice(0, 10) ||
    proof.requestedAt !== exactTimestamp(row.publicationRequestedAt) ||
    proof.readerSummaryJobId !== row.publicationReaderSummaryJobId ||
    proof.readerSummaryArtifactId !== target.artifactId ||
    proof.reportSha256 !== target.reportSha256 ||
    proof.semanticStatus !== "COMPLETED" ||
    proof.modelVersion !== row.modelVersion ||
    target.exactProofSha256 !== target.proofSha256
  ) {
    throw new Error(`Current publication exact proof drifted for ${collectionDate}`);
  }
}

function assertPersistedReportHash(
  row: CurrentPublicationRow,
  collectionDate: string,
): void {
  const report = {
    schemaVersion: "reader_summary.publication_report.v1",
    semanticStatus: row.status,
    modelVersion: row.modelVersion,
    promptVersion: row.promptVersion,
    headline: row.headline,
    summaryText: row.summaryText,
    artifactPayload: row.artifactPayload,
    citations: row.citations,
    qualitySignals: row.qualitySignals,
  };
  if (canonicalJsonSha256(report) !== row.reportSha256) {
    throw new Error(`Current publication report hash drifted for ${collectionDate}`);
  }
}

function exactTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Current publication requestedAt is invalid");
  }
  return parsed.toISOString();
}

function nextUtcDate(collectionDate: string): string {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function requiredSha256(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`Current publication ${label} is invalid`);
  }
  return value;
}

function assertSortedDates(dates: readonly string[]): void {
  if (dates.length < 5) {
    throw new Error("At least five current publication dates are required");
  }
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    if (
      date === undefined ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date ||
      (index > 0 && String(dates[index - 1]) >= date)
    ) {
      throw new Error("Current publication dates must be valid and strictly sorted");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

export async function closeQualityPool(pool: Pick<Pool, "end">): Promise<void> {
  await pool.end().catch(() => undefined);
}

export type QualityPoolClient = Pick<PoolClient, "query" | "release">;
